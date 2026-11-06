// createGame(): the renderer, the loop and everything a game shares.
import * as THREE from "three";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { VignetteShader } from "three/addons/shaders/VignetteShader.js";

import { createEntities } from "./entities.js";
import { createHud } from "./hud.js";
import { createInput } from "./input.js";
import { preset as lightPreset } from "./lights.js";
import { tick as tickMaterials } from "./materials.js";
import { noise2D } from "./math.js";
import { PhysicsWorld } from "./physics.js";
import { createSound } from "./sound.js";

const MAX_DT = 1 / 20;

function injectBaseStyles() {
  const style = document.createElement("style");
  style.textContent =
    "html,body{margin:0;height:100%;overflow:hidden;background:#000}" +
    "canvas[data-game]{position:fixed;inset:0;width:100%;height:100%;display:block;" +
    "outline:none;touch-action:none;-webkit-user-select:none;user-select:none}";
  document.head.prepend(style);
}

function createCamera({ type = "perspective", fov = 60, near = 0.1, far = 1000, size = 20, position = [0, 6, 12], lookAt = [0, 0, 0] }) {
  const aspect = innerWidth / innerHeight;
  const camera =
    type === "orthographic"
      ? new THREE.OrthographicCamera((-size * aspect) / 2, (size * aspect) / 2, size / 2, -size / 2, near, far)
      : new THREE.PerspectiveCamera(fov, aspect, near, far);
  camera.userData.size = size;
  camera.position.set(...position);
  camera.lookAt(...lookAt);
  return camera;
}

function fitCamera(camera) {
  const aspect = innerWidth / innerHeight;
  if (camera.isPerspectiveCamera) {
    camera.aspect = aspect;
  } else {
    const { size } = camera.userData;
    camera.left = (-size * aspect) / 2;
    camera.right = (size * aspect) / 2;
  }
  camera.updateProjectionMatrix();
}

export function disposeObject(root) {
  root.traverse((node) => {
    if (node.geometry && !node.geometry.userData.shared) node.geometry.dispose();
    if (node.isInstancedMesh) node.dispose();
    if (!node.material) return;
    for (const material of [node.material].flat()) {
      if (material.userData.shared) continue;
      for (const value of Object.values(material)) {
        if (value?.isTexture && !value.userData.shared) value.dispose();
      }
      material.dispose();
    }
  });
}

export function createGame(options = {}) {
  const {
    background = 0x10131a,
    camera: cameraOptions = {},
    lights = "daylight", // A lights.preset name, or false to set up your own
    shadows = true,
    bloom = false, // true or { strength, radius, threshold }
    vignette = false, // true or a strength around 1
    gravity = -30,
    maxPixelRatio = 2,
    exposure = 1,
  } = options;

  injectBaseStyles();

  const usesEffects = Boolean(bloom || vignette);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
    ...(usesEffects && { outputBufferType: THREE.HalfFloatType }),
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, maxPixelRatio));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const canvas = renderer.domElement;
  canvas.dataset.game = "";
  document.body.prepend(canvas);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);
  const world = new THREE.Group(); // game.add() and game.clear() work on this
  scene.add(world);

  const physics = new PhysicsWorld({ gravity });
  const timer = new THREE.Timer();
  timer.connect(document);

  let updates = [];
  let frames = [];
  let tasks = [];
  let clearCount = 0;
  let running = false;
  let paused = false;
  let hitstopLeft = 0;
  let shakeLeft = 0;
  let shakeLength = 1;
  let shakeStrength = 0;
  let currentState = null;
  const states = new Map();
  const listeners = new Map();
  const shakeOffset = new THREE.Vector3();
  const projected = new THREE.Vector3();

  const add = (list, fn) => list.concat(fn);

  const game = {
    renderer,
    scene,
    world,
    canvas,
    camera: createCamera(cameraOptions),
    physics,
    sound: createSound(),
    time: 0, // Scaled seconds played, stops while paused
    dt: 0,
    realTime: 0,
    timeScale: 1,
    post: { bloom: null, vignette: null },

    // Loop. onUpdate and onFrame survive clear(); task() does not, so per-level work goes there.
    onUpdate(fn) {
      updates = add(updates, fn);
      return () => (updates = updates.filter((entry) => entry !== fn));
    },
    // Runs every frame, also while paused, with the real delta
    onFrame(fn) {
      frames = add(frames, fn);
      return () => (frames = frames.filter((entry) => entry !== fn));
    },
    // Runs until it returns false, the handle is stopped, or clear() is called
    task(fn) {
      const entry = { fn, stopped: false };
      tasks.push(entry);
      return { stop: () => (entry.stopped = true) };
    },
    after(seconds, fn) {
      let left = seconds;
      return game.task((dt) => {
        left -= dt;
        if (left > 0) return true;
        fn();
        return false;
      });
    },
    every(seconds, fn) {
      let left = seconds;
      return game.task((dt) => {
        left -= dt;
        while (left <= 0) {
          left += seconds;
          if (fn() === false) return false;
        }
        return true;
      });
    },
    wait: (seconds) => new Promise((resolve) => game.after(seconds, resolve)),

    start() {
      if (running) return game;
      running = true;
      renderer.setAnimationLoop(frame);
      return game;
    },
    pause() {
      if (paused) return;
      paused = true;
      game.emit("pause");
    },
    resume() {
      if (!paused) return;
      paused = false;
      game.emit("resume");
    },
    togglePause() {
      if (paused) game.resume();
      else game.pause();
    },
    get paused() {
      return paused;
    },

    // Scene contents. add() goes under game.world, so clear() can remove it.
    add(...objects) {
      world.add(...objects);
      return objects[0];
    },
    // Takes an Object3D or an entity. Shared geometry and materials are left alone.
    remove(object) {
      if (object.kill) return object.kill();
      object.parent?.remove(object);
      disposeObject(object);
    },
    // Resets the level: objects, entities, colliders, tasks, tweens, rigs and particles.
    // onUpdate, onFrame, collide rules, states and lights stay, so setup code can run once.
    clear() {
      clearCount++;
      tasks = [];
      entities.clear();
      physics.clear();
      for (const child of [...world.children]) game.remove(child);
      shakeLeft = 0;
      game.timeScale = 1;
      game.emit("clear");
    },

    // Named game states: state("play", { enter(data), update(dt), exit() }), then go("play", data)
    state(name, definition) {
      states.set(name, definition);
      return game;
    },
    go(name, data) {
      const next = states.get(name);
      if (!next) throw new Error(`Unknown game state "${name}"`);
      currentState?.definition.exit?.();
      currentState = { name, definition: next };
      next.enter?.(data);
    },
    get stateName() {
      return currentState?.name ?? null;
    },

    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
      return () => listeners.get(name).delete(fn);
    },
    emit(name, ...args) {
      for (const fn of [...(listeners.get(name) ?? [])]) fn(...args);
    },

    // Juice
    shake(strength = 0.4, duration = 0.3) {
      shakeStrength = Math.max(strength, shakeLeft > 0 ? shakeStrength : 0);
      shakeLeft = shakeLength = duration;
    },
    hitstop(seconds = 0.06) {
      hitstopLeft = Math.max(hitstopLeft, seconds);
    },

    setCamera(camera) {
      game.camera = camera;
      fitCamera(camera);
    },
    // World position to CSS pixels. visible is false when it is behind the camera or off screen.
    project(position, target = { x: 0, y: 0, visible: false }) {
      projected.copy(position).project(game.camera);
      target.x = ((projected.x + 1) / 2) * innerWidth;
      target.y = ((1 - projected.y) / 2) * innerHeight;
      target.visible = projected.z < 1 && Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1;
      return target;
    },
  };

  const entities = createEntities(game);
  game.spawn = entities.spawn;
  game.query = entities.query;
  game.nearest = entities.nearest;
  game.collide = entities.collide;
  game.input = createInput(canvas, () => game.camera);
  game.hud = createHud(game);

  function setUpEffects() {
    const passes = [];
    if (bloom) {
      const { strength = 0.5, radius = 0.4, threshold = 0.9 } = bloom === true ? {} : bloom;
      game.post.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), strength, radius, threshold);
      passes.push(game.post.bloom);
    }
    if (vignette) {
      game.post.vignette = new ShaderPass(VignetteShader);
      // The shader mixes toward 1 - darkness, so anything but 1 tints corners grey
      game.post.vignette.uniforms.darkness.value = 1;
      game.post.vignette.uniforms.offset.value = vignette === true ? 1 : vignette;
      passes.push(game.post.vignette);
    }
    renderer.setEffects(passes);
  }
  if (usesEffects) setUpEffects();

  function runTasks(dt) {
    const started = clearCount;
    const list = tasks;
    tasks = [];
    const kept = [];
    for (const entry of list) {
      if (entry.stopped) continue;
      if (entry.fn(dt) !== false && !entry.stopped) kept.push(entry);
      if (started !== clearCount) return;
    }
    tasks = kept.concat(tasks);
  }

  function renderFrame() {
    if (shakeLeft <= 0) {
      renderer.render(scene, game.camera);
      return;
    }
    const falloff = (shakeLeft / shakeLength) ** 2;
    const t = game.realTime * 30;
    shakeOffset
      .set(noise2D(t, 1) - 0.5, noise2D(t, 2) - 0.5, noise2D(t, 3) - 0.5)
      .multiplyScalar(2 * shakeStrength * falloff);
    game.camera.position.add(shakeOffset);
    renderer.render(scene, game.camera);
    game.camera.position.sub(shakeOffset);
  }

  function step(realDt) {
    if (hitstopLeft > 0) {
      hitstopLeft -= realDt;
      return;
    }
    const dt = realDt * game.timeScale;
    game.dt = dt;
    game.time += dt;
    physics.step(dt);
    entities.update(dt);
    currentState?.definition.update?.(dt);
    for (const fn of updates) fn(dt, game.time);
    runTasks(dt);
    tickMaterials(dt);
  }

  // A crash stops the loop and shows the message instead of repeating 60 times a second
  function fail(error) {
    renderer.setAnimationLoop(null);
    running = false;
    // Logs like console.error, and also reaches report.js, as it's caught here
    reportError(error);
    game.hud.error(error);
  }

  function frame() {
    try {
      timer.update();
      const realDt = Math.min(timer.getDelta(), MAX_DT);
      game.realTime += realDt;
      if (!paused && realDt > 0) step(realDt);
      for (const fn of frames) fn(realDt, game.realTime);
      shakeLeft -= paused ? 0 : realDt;
      renderFrame();
      game.input.endFrame();
    } catch (error) {
      fail(error);
    }
  }

  addEventListener("resize", () => {
    renderer.setSize(innerWidth, innerHeight);
    fitCamera(game.camera);
    game.emit("resize");
  });

  if (lights) lightPreset(game, lights);
  if (options.start !== false) game.start();

  return game;
}
