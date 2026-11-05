// Welcome page, and a small example of the engine. A game replaces this file.
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

import { anim, createGame, effects, lights, materials, math, THREE } from "./engine/index.js";

// The logo: white faces at three strengths around an orange block
const ORANGE = 0xea580c;
const FACE_TOP = 0xffffff;
const FACE_SIDE = 0xfbdece;
const FACE_FRONT = ORANGE;

const CORE_SIZE = 1.5;
const PLATE_SIZE = 1.86;
const PLATE_DEPTH = 0.2;
const REST_OFFSET = 1.06;
const OPEN_OFFSET = 1.5;

const game = createGame({
  lights: false,
  camera: { fov: 36, position: [0, 0, 11], lookAt: [0, -0.35, 0] },
  bloom: { strength: 0.16, radius: 0.5, threshold: 1 },
  vignette: 1,
});

lights.sky(game, [0x1f0a03, 0x5a2008, 0x0d0502]);
lights.environment(game, 0.2);
game.scene.add(new THREE.HemisphereLight(0xfff1e6, 0xc2410c, 1.1));
lights.sun(game, { color: 0xfff4ea, intensity: 2, position: [4, 7, 5], area: 12, mapSize: 1024 });
const ember = lights.point(ORANGE, 10, 12);
ember.position.set(0, -2, 3);
game.scene.add(ember);

function plate(tint, axis, sign) {
  const size = [PLATE_SIZE, PLATE_SIZE, PLATE_SIZE];
  size["xyz".indexOf(axis)] = PLATE_DEPTH;
  const mesh = new THREE.Mesh(
    new RoundedBoxGeometry(...size, 4, 0.09),
    materials.standard(tint, { roughness: 0.5, metalness: 0 }),
  );
  mesh.castShadow = true;
  mesh.userData.direction = new THREE.Vector3().setComponent("xyz".indexOf(axis), sign);
  return mesh;
}

// Tilted like the logo. The tilt stays fixed while the group inside it spins.
const tilt = new THREE.Group();
tilt.rotation.x = 0.5;
tilt.position.y = 0.75;
const cube = new THREE.Group();
tilt.add(cube);

const core = new THREE.Mesh(
  new RoundedBoxGeometry(CORE_SIZE, CORE_SIZE, CORE_SIZE, 4, 0.1),
  materials.glow(ORANGE, 1.1),
);
const plates = [
  plate(FACE_TOP, "y", 1),
  plate(FACE_TOP, "y", -1),
  plate(FACE_SIDE, "x", 1),
  plate(FACE_SIDE, "x", -1),
  plate(FACE_FRONT, "z", 1),
  plate(FACE_FRONT, "z", -1),
];
cube.add(core, ...plates);
game.add(tilt);

const shadow = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.ShadowMaterial({ opacity: 0.5 }));
shadow.rotation.x = -Math.PI / 2;
shadow.position.y = -1.9;
shadow.receiveShadow = true;
game.add(shadow);

const spread = { offset: REST_OFFSET };
let spin = 0.55;

function placePlates() {
  const breath = Math.sin(game.realTime * 1.4) * 0.025;
  for (const mesh of plates) {
    mesh.position.copy(mesh.userData.direction).multiplyScalar(spread.offset + breath);
  }
}

game.onUpdate((dt) => {
  const { input } = game;

  if (input.pointer.down) spin = input.pointer.dx * 0.25;
  spin = math.damp(spin, 0.55, 2, dt);
  cube.rotation.y += spin * dt;
  tilt.position.y = 0.75 + Math.sin(game.time * 0.9) * 0.06;
  placePlates();

  if (input.pointer.pressed && input.pick(cube)) {
    game.sound.play("powerup", { pitch: math.rand(0.9, 1.15) });
    effects.burst(game, tilt.position, { count: 70, color: 0xffffff, colorEnd: ORANGE, speed: 7, size: 0.2, life: 0.8, drag: 2.5 });
    anim.tween(game, spread, { offset: OPEN_OFFSET }, { duration: 0.22, ease: "outCubic" }).then(() =>
      anim.tween(game, spread, { offset: REST_OFFSET }, { duration: 0.8, ease: "outElastic" }),
    );
  }
});

game.every(0.07, () => {
  const x = math.rand(-4.5, 4.5);
  effects.burst(game, [x, -2.1, math.rand(-3, 1)], {
    count: 1,
    color: 0xffd9c2,
    colorEnd: ORANGE,
    size: 0.09,
    sizeEnd: 0.02,
    life: 3.4,
    speed: 0.75,
    spread: 0.2,
    drag: 0.1,
  });
});

game.hud.screen({
  title: "Your game will appear here",
  subtitle: "Tell the chat what to build",
  dim: false,
  passive: true,
  align: "bottom",
});
