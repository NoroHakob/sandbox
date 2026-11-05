// Particles and one-shot visual effects. Particles share two draw calls, one for glow
// and one for smoke and debris, so bursts are cheap to fire often.
import * as THREE from "three";

import { clamp, rand, randomOnSphere } from "./math.js";

const CAPACITY = 4000;
const systems = new WeakMap();
const color = new THREE.Color();
const direction = new THREE.Vector3();
const point = new THREE.Vector3();

const PARTICLE_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute vec4 aColor;
  attribute float aHard;
  uniform float uScale;
  uniform float uOrtho;
  varying vec4 vColor;
  varying float vHard;
  void main() {
    vColor = aColor;
    vHard = aHard;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = aSize * uScale / mix(max(-viewPosition.z, 0.001), 1.0, uOrtho);
  }
`;

const PARTICLE_FRAGMENT = /* glsl */ `
  varying vec4 vColor;
  varying float vHard;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float alpha = mix(1.0 - smoothstep(0.1, 1.0, d), 1.0, vHard);
    if (alpha <= 0.0) discard;
    gl_FragColor = vec4(vColor.rgb, vColor.a * alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// Struct-of-arrays pool with swap removal, so nothing allocates during play
class ParticlePool {
  constructor(scene, blending) {
    const size = (n) => new Float32Array(CAPACITY * n);
    this.count = 0;
    this.position = size(3);
    this.velocity = size(3);
    this.age = size(1);
    this.life = size(1);
    this.drag = size(1);
    this.gravity = size(1);
    this.sizes = size(2);
    this.colors = size(6);
    this.alpha = size(1);
    this.liveSize = size(1);
    this.liveColor = size(4);
    this.hard = size(1);

    this.geometry = new THREE.BufferGeometry();
    const dynamic = (array, width) => new THREE.BufferAttribute(array, width).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute("position", dynamic(this.position, 3));
    this.geometry.setAttribute("aSize", dynamic(this.liveSize, 1));
    this.geometry.setAttribute("aColor", dynamic(this.liveColor, 4));
    this.geometry.setAttribute("aHard", dynamic(this.hard, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 1 }, uOrtho: { value: 0 } },
      vertexShader: PARTICLE_VERTEX,
      fragmentShader: PARTICLE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    scene.add(this.points);
  }

  add(x, y, z, vx, vy, vz, options) {
    if (this.count >= CAPACITY) return;
    const i = this.count++;
    const i3 = i * 3;
    const i2 = i * 2;
    const i6 = i * 6;
    this.position[i3] = x;
    this.position[i3 + 1] = y;
    this.position[i3 + 2] = z;
    this.velocity[i3] = vx;
    this.velocity[i3 + 1] = vy;
    this.velocity[i3 + 2] = vz;
    this.age[i] = 0;
    this.life[i] = options.life * (1 + rand(-options.lifeVariance, options.lifeVariance));
    this.drag[i] = options.drag;
    this.gravity[i] = options.gravity;
    this.sizes[i2] = options.size * rand(0.7, 1.3);
    this.sizes[i2 + 1] = options.sizeEnd;
    this.alpha[i] = options.alpha;
    this.hard[i] = options.soft ? 0 : 1;
    this.colors.set(options.rgbStart, i6);
    this.colors.set(options.rgbEnd, i6 + 3);
  }

  kill(i) {
    const last = --this.count;
    if (i === last) return;
    const moveOne = (array, width) => array.copyWithin(i * width, last * width, last * width + width);
    moveOne(this.position, 3);
    moveOne(this.velocity, 3);
    moveOne(this.age, 1);
    moveOne(this.life, 1);
    moveOne(this.drag, 1);
    moveOne(this.gravity, 1);
    moveOne(this.sizes, 2);
    moveOne(this.colors, 6);
    moveOne(this.alpha, 1);
    moveOne(this.hard, 1);
  }

  update(dt, camera, renderer) {
    if (this.count === 0 && !this.drawn) return;
    this.drawn = this.count > 0;

    for (let i = this.count - 1; i >= 0; i--) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) this.kill(i);
    }

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      const keep = Math.exp(-this.drag[i] * dt);
      this.velocity[i3] *= keep;
      this.velocity[i3 + 1] = this.velocity[i3 + 1] * keep + this.gravity[i] * dt;
      this.velocity[i3 + 2] *= keep;
      this.position[i3] += this.velocity[i3] * dt;
      this.position[i3 + 1] += this.velocity[i3 + 1] * dt;
      this.position[i3 + 2] += this.velocity[i3 + 2] * dt;

      const t = this.age[i] / this.life[i];
      const i6 = i * 6;
      this.liveSize[i] = this.sizes[i * 2] + (this.sizes[i * 2 + 1] - this.sizes[i * 2]) * t;
      for (let c = 0; c < 3; c++) {
        this.liveColor[i * 4 + c] = this.colors[i6 + c] + (this.colors[i6 + 3 + c] - this.colors[i6 + c]) * t;
      }
      this.liveColor[i * 4 + 3] = this.alpha[i] * (1 - t);
    }

    for (const name of ["position", "aSize", "aColor", "aHard"]) {
      const attribute = this.geometry.getAttribute(name);
      attribute.needsUpdate = true;
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, this.count * attribute.itemSize);
    }
    this.geometry.setDrawRange(0, this.count);

    const { uScale, uOrtho } = this.material.uniforms;
    const pixels = renderer.domElement.height;
    if (camera.isPerspectiveCamera) {
      uOrtho.value = 0;
      uScale.value = pixels / (2 * Math.tan((camera.fov * Math.PI) / 360));
    } else {
      uOrtho.value = 1;
      uScale.value = (pixels * camera.zoom) / (camera.top - camera.bottom);
    }
  }
}

function particles(game) {
  let system = systems.get(game);
  if (!system) {
    system = {
      glow: new ParticlePool(game.scene, THREE.AdditiveBlending),
      plain: new ParticlePool(game.scene, THREE.NormalBlending),
    };
    systems.set(game, system);
    game.onUpdate((dt) => {
      system.glow.update(dt, game.camera, game.renderer);
      system.plain.update(dt, game.camera, game.renderer);
    });
    game.on("clear", () => {
      system.glow.count = 0;
      system.plain.count = 0;
    });
  }
  return system;
}

const rgb = (value) => {
  color.set(value);
  return [color.r, color.g, color.b];
};

function particleOptions({
  color: start = 0xffffff,
  colorEnd = start,
  size = 0.3,
  sizeEnd = 0,
  life = 0.6,
  lifeVariance = 0.4,
  gravity = 0,
  drag = 1,
  alpha = 1,
  soft = true,
}) {
  return { rgbStart: rgb(start), rgbEnd: rgb(colorEnd), size, sizeEnd, life, lifeVariance, gravity, drag, alpha, soft };
}

const toPoint = (value) => {
  if (value.object) return value.object.position;
  if (value.isObject3D) return value.getWorldPosition(point);
  if (Array.isArray(value)) return point.set(...value);
  return value;
};

// Fires particles from a position. spread: 1 all directions, 0 exactly along direction.
// glow: true blends additively, for fire and sparks; false is for smoke and debris.
export function burst(game, position, options = {}) {
  const {
    count = 24,
    speed = 4,
    speedVariance = 0.6,
    spread = 1,
    direction: aim = [0, 1, 0],
    radius = 0,
    glow = true,
  } = options;
  const origin = toPoint(position);
  const pool = particles(game)[glow ? "glow" : "plain"];
  const settings = particleOptions(options);
  const { x, y, z } = origin;
  for (let i = 0; i < count; i++) {
    randomOnSphere(1, direction);
    const vx = aim[0] * (1 - spread) + direction.x * spread;
    const vy = aim[1] * (1 - spread) + direction.y * spread;
    const vz = aim[2] * (1 - spread) + direction.z * spread;
    const force = speed * (1 + rand(-speedVariance, speedVariance));
    randomOnSphere(radius * Math.random(), direction);
    pool.add(x + direction.x, y + direction.y, z + direction.z, vx * force, vy * force, vz * force, settings);
  }
}

export function sparkle(game, position, { color: tint = 0xffe08a, count = 14 } = {}) {
  burst(game, position, { count, color: tint, speed: 3, size: 0.22, life: 0.5, gravity: -6 });
}

export function dust(game, position, { color: tint = 0xcfc6b8, count = 8 } = {}) {
  burst(game, position, { count, color: tint, speed: 1.6, size: 0.35, sizeEnd: 0.8, life: 0.5, drag: 3, spread: 0.8, direction: [0, 0.3, 0], glow: false, alpha: 0.55 });
}

export function hit(game, position, { color: tint = 0xffffff, count = 12 } = {}) {
  burst(game, position, { count, color: tint, speed: 6, size: 0.18, life: 0.28, drag: 3 });
}

export function confetti(game, position, { count = 70 } = {}) {
  for (const tint of [0xef4444, 0xfacc15, 0x22c55e, 0x3b82f6, 0xec4899]) {
    burst(game, position, { count: count / 5, color: tint, speed: 8, size: 0.2, sizeEnd: 0.16, life: 1.6, gravity: -9, drag: 1.6, spread: 0.7, glow: false, soft: false });
  }
}

export function explosion(game, position, { scale = 1, color: tint = 0xffa53d, shake = true } = {}) {
  burst(game, position, { count: 36, color: 0xfff1c2, colorEnd: tint, speed: 7 * scale, size: 1.1 * scale, life: 0.4, drag: 3 });
  burst(game, position, { count: 24, color: tint, colorEnd: 0x7f1d1d, speed: 4 * scale, size: 1.5 * scale, sizeEnd: 0.4, life: 0.65, drag: 2 });
  burst(game, position, { count: 16, color: 0x3a3a3a, speed: 2.6 * scale, size: 1.2 * scale, sizeEnd: 2.6 * scale, life: 1.1, drag: 1.5, glow: false, alpha: 0.5, spread: 0.8, direction: [0, 1, 0] });
  burst(game, position, { count: 14, color: 0xffd28a, speed: 12 * scale, size: 0.14, life: 0.7, gravity: -14, drag: 1 });
  if (shake) game.shake(0.35 * scale, 0.35);
}

// Expanding ring on the ground
export function shockwave(game, position, { color: tint = 0xffffff, radius = 5, duration = 0.45 } = {}) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.92, 1, 48),
    new THREE.MeshBasicMaterial({ color: tint, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(toPoint(position));
  ring.position.y += 0.05;
  game.add(ring);
  let age = 0;
  game.task((dt) => {
    age += dt;
    const t = clamp(age / duration);
    ring.scale.setScalar(0.01 + radius * (1 - (1 - t) ** 3));
    ring.material.opacity = 1 - t;
    if (t < 1) return true;
    game.remove(ring);
    return false;
  });
}

// Keeps emitting from an object or point: a trail, a torch, an engine. Stop it with .stop().
// An object that leaves the world stops it too. Takes the same options as burst().
export function emitter(game, source, { rate = 40, ...options } = {}) {
  const object = source.object ?? source;
  const position = object.isObject3D ? new THREE.Vector3() : object;
  const single = { count: 1, ...options };
  let debt = 0;
  return game.task((dt) => {
    if (object.isObject3D) {
      if (!object.parent) return false;
      object.getWorldPosition(position);
    }
    debt += rate * dt;
    while (debt >= 1) {
      debt -= 1;
      burst(game, position, single);
    }
    return true;
  });
}

export const fire = (game, source, { scale = 1, ...options } = {}) =>
  emitter(game, source, { rate: 45, color: 0xffd27a, colorEnd: 0xd9340f, speed: 1.2 * scale, size: 0.7 * scale, life: 0.65, gravity: 3 * scale, spread: 0.3, radius: 0.15 * scale, ...options });

export const smoke = (game, source, { scale = 1, ...options } = {}) =>
  emitter(game, source, { rate: 12, color: 0x6b6b6b, speed: 0.8 * scale, size: 0.7 * scale, sizeEnd: 2 * scale, life: 1.8, gravity: 1, spread: 0.3, glow: false, alpha: 0.35, ...options });

export const trail = (game, source, { color: tint = 0x7dd3fc, size = 0.35, ...options } = {}) =>
  emitter(game, source, { rate: 70, color: tint, speed: 0.1, size, life: 0.35, ...options });

// Text that rises from a world position and fades: damage numbers, +10
export function floatText(game, position, text, { color: tint = "#fff", size = 22, duration = 0.8, rise = 60 } = {}) {
  const node = document.createElement("div");
  node.className = "hud-float";
  node.textContent = text;
  node.style.color = tint;
  node.style.fontSize = `${size}px`;
  game.hud.root.append(node);
  const anchor = toPoint(position).clone();
  const screen = { x: 0, y: 0, visible: false };
  let age = 0;
  game.task((dt) => {
    age += dt;
    const t = age / duration;
    if (t >= 1) {
      node.remove();
      return false;
    }
    game.project(anchor, screen);
    node.style.opacity = `${Math.min(1, (1 - t) * 2)}`;
    node.style.transform = `translate(${screen.x}px,${screen.y - rise * t}px) translate(-50%,-50%) scale(${1 + (1 - t) * 0.3})`;
    return true;
  });
}

// Full screen color flash, for damage or a pickup
export function screenFlash(game, { color: tint = "#fff", duration = 0.25, opacity = 0.5 } = {}) {
  const node = document.createElement("div");
  node.className = "hud-flash";
  node.style.background = tint;
  node.style.opacity = opacity;
  node.style.setProperty("--hud-delay", `${duration}s`);
  node.addEventListener("animationend", () => node.remove());
  game.hud.root.append(node);
}

function ambientPoints(game, { count, area, height, size, color: tint, opacity = 0.8, step }) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = rand(-area, area);
    positions[i * 3 + 1] = rand(0, height);
    positions[i * 3 + 2] = rand(-area, area);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  const material = new THREE.PointsMaterial({ color: tint, size, transparent: true, opacity, depthWrite: false });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  game.add(points);
  game.task((dt) => {
    const { x, z } = game.camera.position;
    points.position.set(x, 0, z);
    step(positions, dt, game.time);
    for (let i = 0; i < count; i++) {
      if (positions[i * 3 + 1] < 0) positions[i * 3 + 1] += height;
    }
    geometry.attributes.position.needsUpdate = true;
  });
  return points;
}

// Falls around the camera. type: "snow" or "rain".
export function weather(game, { type = "snow", count = 1500, area = 40, height = 30 } = {}) {
  const speed = type === "rain" ? 34 : 2.4;
  return ambientPoints(game, {
    count,
    area,
    height,
    size: type === "rain" ? 0.07 : 0.14,
    color: type === "rain" ? 0x9cc6ea : 0xffffff,
    step(positions, dt, time) {
      for (let i = 0; i < positions.length; i += 3) {
        positions[i + 1] -= speed * dt;
        if (type === "snow") positions[i] += Math.sin(time + i) * 0.4 * dt;
      }
    },
  });
}

// Dome of stars that stays around the camera
export function stars(game, { count = 2500, radius = 400, size = 1.6, color: tint = 0xffffff } = {}) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    randomOnSphere(radius, direction);
    positions.set([direction.x, Math.abs(direction.y), direction.z], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const field = new THREE.Points(geometry, new THREE.PointsMaterial({ color: tint, size, sizeAttenuation: false, fog: false, depthWrite: false }));
  field.frustumCulled = false;
  game.add(field);
  game.task(() => {
    field.position.copy(game.camera.position);
  });
  return field;
}
