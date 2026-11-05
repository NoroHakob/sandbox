// Low-poly models built in code. Every model has its origin at the base, faces +Z and
// casts shadows, so object.lookAt() and physics bodies work on all of them. Colors and
// sizes are options. Each model is a single draw call, and repeat calls share geometry.
// Animated models expose their moving pieces on model.parts.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import * as materials from "./materials.js";
import { createRng, fbm, lerp, noise2D, randInt, TAU } from "./math.js";
import * as textures from "./textures.js";

const geometryCache = new Map();
const color = new THREE.Color();
const matrix = new THREE.Matrix4();
const quaternion = new THREE.Quaternion();
const euler = new THREE.Euler();

function part(geometry, tint, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
  const shaped = geometry.index ? geometry.toNonIndexed() : geometry;
  shaped.deleteAttribute("uv");
  euler.set(...rotation);
  const size = Array.isArray(scale) ? scale : [scale, scale, scale];
  matrix.compose(new THREE.Vector3(...position), quaternion.setFromEuler(euler), new THREE.Vector3(...size));
  shaped.applyMatrix4(matrix);
  color.set(tint);
  const colors = new Float32Array(shaped.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) colors.set([color.r, color.g, color.b], i);
  shaped.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return shaped;
}

const box = (w, h, d, tint, position, rotation) => part(new THREE.BoxGeometry(w, h, d), tint, position, rotation);
const cylinder = (top, bottom, h, tint, position, rotation, sides = 10) => part(new THREE.CylinderGeometry(top, bottom, h, sides), tint, position, rotation);
const cone = (r, h, tint, position, rotation, sides = 8) => part(new THREE.ConeGeometry(r, h, sides), tint, position, rotation);
const ball = (r, tint, position, scale, detail = 1) => part(new THREE.IcosahedronGeometry(r, detail), tint, position, undefined, scale);
const torus = (r, tube, tint, position, rotation, sides = 18) => part(new THREE.TorusGeometry(r, tube, 8, sides), tint, position, rotation);

// Moves vertices by noise of their position, so shared corners stay joined
function jitter(geometry, amount, seed = 1) {
  const { position } = geometry.attributes;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const n = (axis) => (noise2D(x * 3 + axis * 7, y * 3 + z * 3, seed) - 0.5) * amount * 2;
    position.setXYZ(i, x + n(1), y + n(2), z + n(3));
  }
  return geometry;
}

function mergedGeometry(key, build) {
  if (key && geometryCache.has(key)) return geometryCache.get(key);
  const geometry = mergeGeometries(build().flat());
  geometry.computeVertexNormals();
  geometry.userData.shared = Boolean(key);
  if (key) geometryCache.set(key, geometry);
  return geometry;
}

function solid(key, build) {
  const mesh = new THREE.Mesh(mergedGeometry(key, build), materials.painted());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

const keyOf = (name, options) => `${name}:${JSON.stringify(options)}`;

function glowing(mesh, key, glowColor, intensity, build) {
  const light = new THREE.Mesh(mergedGeometry(key, build), materials.glow(glowColor, intensity));
  const group = new THREE.Group();
  group.add(mesh, light);
  return group;
}

// Nature

export function tree({ kind = "round", height = 3.5, leaves, trunk = 0x7a5230, seed = randInt(0, 4) } = {}) {
  const key = keyOf("tree", { kind, height, leaves, trunk, seed });
  return solid(key, () => {
    const rng = createRng(seed + 1);
    if (kind === "pine") {
      const tint = leaves ?? 0x2f7d4f;
      return [
        cylinder(0.14, 0.2, height * 0.3, trunk, [0, height * 0.15, 0], undefined, 7),
        cone(height * 0.36, height * 0.46, tint, [0, height * 0.43, 0]),
        cone(height * 0.29, height * 0.4, new THREE.Color(tint).offsetHSL(0, 0, 0.03), [0, height * 0.63, 0]),
        cone(height * 0.2, height * 0.34, new THREE.Color(tint).offsetHSL(0, 0, 0.06), [0, height * 0.83, 0]),
      ];
    }
    if (kind === "palm") {
      const tint = leaves ?? 0x4caf50;
      const crown = [];
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * TAU;
        crown.push(box(0.34, 0.06, height * 0.42, tint, [Math.sin(angle) * height * 0.19, height * 0.93, Math.cos(angle) * height * 0.19], [0.42 * Math.cos(angle), angle, 0]));
      }
      return [cylinder(0.1, 0.2, height, trunk, [0.1, height / 2, 0], [0, 0, -0.08], 7), ...crown];
    }
    if (kind === "dead") {
      return [
        cylinder(0.08, 0.2, height * 0.7, trunk, [0, height * 0.35, 0], undefined, 6),
        cylinder(0.03, 0.08, height * 0.4, trunk, [0.28, height * 0.75, 0], [0, 0, -0.8], 5),
        cylinder(0.03, 0.08, height * 0.32, trunk, [-0.2, height * 0.62, 0.1], [0.3, 0, 0.8], 5),
      ];
    }
    const tint = leaves ?? 0x4f9e4a;
    const blob = (r, x, y, z) => jitter(ball(r, new THREE.Color(tint).offsetHSL(0, 0, rng.range(-0.03, 0.05)), [x, y, z]), r * 0.12, seed);
    return [
      cylinder(0.16, 0.24, height * 0.5, trunk, [0, height * 0.25, 0], undefined, 7),
      blob(height * 0.28, 0, height * 0.66, 0),
      blob(height * 0.2, height * 0.18, height * 0.52, height * 0.08),
      blob(height * 0.18, -height * 0.17, height * 0.56, -height * 0.08),
    ];
  });
}

export function rock({ size = 1, tint = 0x8a8f96, seed = randInt(0, 4) } = {}) {
  return solid(keyOf("rock", { size, tint, seed }), () => [
    jitter(part(new THREE.IcosahedronGeometry(size * 0.7, 1), tint, [0, size * 0.42, 0], undefined, [1.1, 0.75, 0.9]), size * 0.14, seed),
  ]);
}

export function bush({ size = 1, tint = 0x4a9648 } = {}) {
  return solid(keyOf("bush", { size, tint }), () => [
    ball(size * 0.5, tint, [0, size * 0.4, 0]),
    ball(size * 0.36, 0x57a853, [size * 0.4, size * 0.3, size * 0.1]),
    ball(size * 0.32, 0x437f42, [-size * 0.38, size * 0.28, -size * 0.12]),
  ]);
}

export function flower({ tint = 0xf472b6, center = 0xfacc15 } = {}) {
  return solid(keyOf("flower", { tint, center }), () => {
    const petals = [];
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * TAU;
      petals.push(ball(0.08, tint, [Math.sin(angle) * 0.11, 0.52, Math.cos(angle) * 0.11], undefined, 0));
    }
    return [cylinder(0.015, 0.02, 0.5, 0x3f8f3a, [0, 0.25, 0], undefined, 5), ball(0.06, center, [0, 0.53, 0], undefined, 0), ...petals];
  });
}

export function mushroom({ tint = 0xdc2626, size = 1 } = {}) {
  return solid(keyOf("mushroom", { tint, size }), () => [
    cylinder(0.12 * size, 0.16 * size, 0.4 * size, 0xf1e8d6, [0, 0.2 * size, 0]),
    part(new THREE.SphereGeometry(0.34 * size, 12, 6, 0, TAU, 0, Math.PI / 2), tint, [0, 0.38 * size, 0]),
  ]);
}

export function cloud({ size = 2 } = {}) {
  const mesh = solid(keyOf("cloud", { size }), () => [
    ball(size * 0.5, 0xffffff, [0, 0, 0], [1.3, 0.8, 1]),
    ball(size * 0.38, 0xf5f8fb, [size * 0.62, -size * 0.06, 0], [1.2, 0.8, 1]),
    ball(size * 0.34, 0xf5f8fb, [-size * 0.62, -size * 0.08, 0.1], [1.2, 0.8, 1]),
  ]);
  mesh.castShadow = false;
  return mesh;
}

export function mountain({ height = 30, radius = 26, rockColor = 0x6b7280, snow = 0xf3f6fa, seed = 1 } = {}) {
  return solid(keyOf("mountain", { height, radius, rockColor, snow, seed }), () => [
    jitter(cone(radius, height, rockColor, [0, height / 2, 0], undefined, 9), height * 0.04, seed),
    jitter(cone(radius * 0.36, height * 0.36, snow, [0, height * 0.83, 0], undefined, 9), height * 0.01, seed),
  ]);
}

// Props

export function crate({ size = 1, tint = 0xb07a45, frame = 0x7a4f28 } = {}) {
  const s = size;
  const bar = 0.1 * s;
  const edge = (x, y, z, w, h, d) => box(w, h, d, frame, [x, y, z]);
  const half = s / 2;
  return solid(keyOf("crate", { s, tint, frame }), () => [
    box(s * 0.96, s * 0.96, s * 0.96, tint, [0, half, 0]),
    ...[-1, 1].flatMap((sx) => [-1, 1].flatMap((sz) => [
      edge(sx * (half - bar / 2), half, sz * (half - bar / 2), bar, s, bar),
    ])),
    ...[bar / 2, s - bar / 2].flatMap((y) => [
      edge(0, y, half - bar / 2, s, bar, bar),
      edge(0, y, -half + bar / 2, s, bar, bar),
      edge(half - bar / 2, y, 0, bar, bar, s),
      edge(-half + bar / 2, y, 0, bar, bar, s),
    ]),
  ]);
}

export function barrel({ tint = 0x8b5a2b, band = 0x4b5563 } = {}) {
  return solid(keyOf("barrel", { tint, band }), () => [
    cylinder(0.36, 0.3, 0.5, tint, [0, 0.75, 0], undefined, 12),
    cylinder(0.3, 0.36, 0.5, tint, [0, 0.25, 0], undefined, 12),
    cylinder(0.38, 0.38, 0.06, band, [0, 0.5, 0], undefined, 12),
    cylinder(0.34, 0.34, 0.05, band, [0, 0.2, 0], undefined, 12),
    cylinder(0.34, 0.34, 0.05, band, [0, 0.8, 0], undefined, 12),
  ]);
}

export function chest({ tint = 0x9a6235, trim = 0xfacc15 } = {}) {
  return solid(keyOf("chest", { tint, trim }), () => [
    box(1, 0.5, 0.65, tint, [0, 0.25, 0]),
    part(new THREE.CylinderGeometry(0.33, 0.33, 1, 10, 1, false, 0, Math.PI), tint, [0, 0.5, 0], [0, 0, Math.PI / 2]),
    box(1.04, 0.06, 0.68, trim, [0, 0.5, 0]),
    box(0.16, 0.2, 0.05, trim, [0, 0.44, 0.34]),
  ]);
}

export function fence({ length = 2, tint = 0xc8a673 } = {}) {
  return solid(keyOf("fence", { length, tint }), () => [
    box(0.12, 0.9, 0.12, tint, [-length / 2 + 0.06, 0.45, 0]),
    box(0.12, 0.9, 0.12, tint, [length / 2 - 0.06, 0.45, 0]),
    box(length, 0.1, 0.05, tint, [0, 0.65, 0]),
    box(length, 0.1, 0.05, tint, [0, 0.35, 0]),
  ]);
}

export function lampPost({ height = 4, tint = 0x374151, light = 0xffd98a } = {}) {
  return glowing(
    solid(keyOf("lampPost", { height, tint }), () => [
      cylinder(0.05, 0.09, height, tint, [0, height / 2, 0], undefined, 7),
      cone(0.28, 0.18, tint, [0, height + 0.1, 0], undefined, 8),
    ]),
    keyOf("lampLight", { height }),
    light,
    4,
    () => [ball(0.17, 0xffffff, [0, height - 0.08, 0])],
  );
}

export function trafficCone({ tint = 0xf97316 } = {}) {
  return solid(keyOf("trafficCone", { tint }), () => [
    box(0.5, 0.05, 0.5, 0x262626, [0, 0.025, 0]),
    cone(0.2, 0.7, tint, [0, 0.4, 0], undefined, 10),
    cylinder(0.11, 0.135, 0.11, 0xffffff, [0, 0.36, 0], undefined, 10),
  ]);
}

export function flag({ height = 3, tint = 0xef4444, pole = 0xd1d5db } = {}) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0.9, 0.3);
  shape.lineTo(0, 0.6);
  return solid(keyOf("flag", { height, tint, pole }), () => [
    cylinder(0.04, 0.05, height, pole, [0, height / 2, 0], undefined, 7),
    ball(0.08, pole, [0, height + 0.04, 0], undefined, 0),
    part(new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false }), tint, [0.04, height - 0.68, -0.015]),
  ]);
}

export function sign({ tint = 0xc8a673 } = {}) {
  return solid(keyOf("sign", { tint }), () => [
    box(0.12, 1.2, 0.12, tint, [0, 0.6, 0]),
    box(1.2, 0.6, 0.08, tint, [0, 1.2, 0]),
  ]);
}

// Pickups. They sit at a good height to collect, and spin well with anim.spin.

export function coin({ tint = 0xfacc15 } = {}) {
  return solid(keyOf("coin", { tint }), () => [
    cylinder(0.32, 0.32, 0.07, tint, [0, 0.5, 0], [Math.PI / 2, 0, 0], 16),
    cylinder(0.2, 0.2, 0.09, 0xfde68a, [0, 0.5, 0], [Math.PI / 2, 0, 0], 12),
  ]);
}

export function gem({ tint = 0x22d3ee, size = 1 } = {}) {
  return solid(keyOf("gem", { tint, size }), () => [
    cone(0.26 * size, 0.42 * size, tint, [0, 0.72 * size, 0], undefined, 6),
    cone(0.26 * size, 0.28 * size, new THREE.Color(tint).offsetHSL(0, 0, -0.1), [0, 0.37 * size, 0], [Math.PI, 0, 0], 6),
  ]);
}

function extruded(shape, depth, tint, y) {
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1, curveSegments: 6 });
  geometry.center();
  return part(geometry, tint, [0, y, 0]);
}

export function heart({ tint = 0xef4444 } = {}) {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.3);
  shape.bezierCurveTo(-0.5, 0, -0.32, 0.36, 0, 0.14);
  shape.bezierCurveTo(0.32, 0.36, 0.5, 0, 0, -0.3);
  return solid(keyOf("heart", { tint }), () => [extruded(shape, 0.14, tint, 0.55)]);
}

export function star({ tint = 0xfacc15, points = 5 } = {}) {
  const shape = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const angle = (i / (points * 2)) * TAU + Math.PI / 2;
    const r = i % 2 ? 0.17 : 0.38;
    shape[i ? "lineTo" : "moveTo"](Math.cos(angle) * r, Math.sin(angle) * r);
  }
  return solid(keyOf("star", { tint, points }), () => [extruded(shape, 0.12, tint, 0.55)]);
}

export function key({ tint = 0xfacc15 } = {}) {
  return solid(keyOf("key", { tint }), () => [
    torus(0.13, 0.04, tint, [0, 0.72, 0]),
    box(0.06, 0.42, 0.06, tint, [0, 0.4, 0]),
    box(0.14, 0.05, 0.06, tint, [0.08, 0.24, 0]),
    box(0.1, 0.05, 0.06, tint, [0.06, 0.32, 0]),
  ]);
}

export function potion({ tint = 0xa855f7 } = {}) {
  return solid(keyOf("potion", { tint }), () => [
    ball(0.22, tint, [0, 0.42, 0]),
    cylinder(0.08, 0.1, 0.18, 0xe5e7eb, [0, 0.67, 0]),
    cylinder(0.1, 0.1, 0.07, 0x92400e, [0, 0.78, 0]),
  ]);
}

export function bomb({ tint = 0x27272a } = {}) {
  return solid(keyOf("bomb", { tint }), () => [
    ball(0.32, tint, [0, 0.36, 0], undefined, 2),
    cylinder(0.1, 0.1, 0.09, 0x52525b, [0, 0.71, 0]),
    cylinder(0.02, 0.02, 0.2, 0xd6c6a5, [0.04, 0.82, 0], [0, 0, -0.4], 5),
  ]);
}

// Gear

export function sword({ blade = 0xdbe4ee, hilt = 0x92400e, guard = 0xfacc15 } = {}) {
  return solid(keyOf("sword", { blade, hilt, guard }), () => [
    box(0.08, 0.28, 0.08, hilt, [0, 0.14, 0]),
    box(0.34, 0.06, 0.1, guard, [0, 0.31, 0]),
    box(0.1, 0.9, 0.03, blade, [0, 0.79, 0]),
    cone(0.07, 0.14, blade, [0, 1.31, 0], undefined, 4),
  ]);
}

export function blaster({ tint = 0x374151, accent = 0x22d3ee } = {}) {
  return solid(keyOf("blaster", { tint, accent }), () => [
    box(0.08, 0.2, 0.1, 0x1f2937, [0, 0.1, -0.1], [-0.25, 0, 0]),
    box(0.1, 0.13, 0.46, tint, [0, 0.24, 0.02]),
    cylinder(0.035, 0.035, 0.24, accent, [0, 0.24, 0.32], [Math.PI / 2, 0, 0], 8),
  ]);
}

export function shield({ tint = 0x2563eb, trim = 0xe5e7eb } = {}) {
  return solid(keyOf("shield", { tint, trim }), () => [
    cylinder(0.42, 0.42, 0.04, trim, [0, 0.5, 0], [Math.PI / 2, 0, 0], 7),
    cylinder(0.36, 0.36, 0.06, tint, [0, 0.5, 0.01], [Math.PI / 2, 0, 0], 7),
    ball(0.08, trim, [0, 0.5, 0.05], undefined, 0),
  ]);
}

export function bullet({ tint = 0xfff1a8, intensity = 3, length = 0.5 } = {}) {
  const mesh = new THREE.Mesh(mergedGeometry(keyOf("bullet", { length }), () => [cylinder(0.05, 0.05, length, 0xffffff, [0, 0, 0], [Math.PI / 2, 0, 0], 6)]), materials.glow(tint, intensity));
  return mesh;
}

export function missile({ tint = 0xe5e7eb, tip = 0xef4444 } = {}) {
  return solid(keyOf("missile", { tint, tip }), () => [
    cylinder(0.1, 0.1, 0.7, tint, [0, 0, 0], [Math.PI / 2, 0, 0]),
    cone(0.1, 0.24, tip, [0, 0, 0.47], [Math.PI / 2, 0, 0]),
    box(0.4, 0.02, 0.16, tip, [0, 0, -0.28]),
    box(0.02, 0.4, 0.16, tip, [0, 0, -0.28]),
  ]);
}

export function asteroid({ size = 1, tint = 0x79716b, seed = randInt(0, 4) } = {}) {
  return solid(keyOf("asteroid", { size, tint, seed }), () => [
    jitter(part(new THREE.IcosahedronGeometry(size, 2), tint), size * 0.22, seed),
  ]);
}

// Buildings

export function house({ wall = 0xf1e4cf, roof = 0xb4493a, door = 0x7a4f28, width = 4, depth = 4, height = 2.6 } = {}) {
  const roofHeight = width * 0.42;
  return solid(keyOf("house", { wall, roof, door, width, depth, height }), () => {
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-width / 2 - 0.25, 0);
    roofShape.lineTo(0, roofHeight);
    roofShape.lineTo(width / 2 + 0.25, 0);
    const pane = (x) => box(0.7, 0.7, 0.05, 0x9bd2ef, [x, height * 0.6, depth / 2 + 0.01]);
    return [
      box(width, height, depth, wall, [0, height / 2, 0]),
      part(new THREE.ExtrudeGeometry(roofShape, { depth: depth + 0.5, bevelEnabled: false }), roof, [0, height, -depth / 2 - 0.25]),
      box(0.8, 1.5, 0.05, door, [0, 0.75, depth / 2 + 0.01]),
      pane(-width * 0.29),
      pane(width * 0.29),
      box(0.5, 1.1, 0.5, 0x8c5a4a, [width * 0.25, height + roofHeight * 0.6, -depth * 0.1]),
    ];
  });
}

export function tower({ height = 8, radius = 1.6, tint = 0x9aa0a8, roof = 0x3b5ba5 } = {}) {
  return solid(keyOf("tower", { height, radius, tint, roof }), () => {
    const teeth = [];
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * TAU;
      teeth.push(box(0.5, 0.5, 0.4, tint, [Math.sin(angle) * radius * 1.1, height + 0.4, Math.cos(angle) * radius * 1.1], [0, angle, 0]));
    }
    return [
      cylinder(radius, radius * 1.1, height, tint, [0, height / 2, 0], undefined, 12),
      cylinder(radius * 1.25, radius * 1.05, 0.5, tint, [0, height, 0], undefined, 12),
      cone(radius * 1.05, radius * 1.8, roof, [0, height + 0.25 + radius * 0.9, 0], undefined, 12),
      ...teeth,
      box(0.9, 1.6, 0.1, 0x4a3320, [0, 0.8, radius * 1.07]),
    ];
  });
}

export function portal({ radius = 1.2, tint = 0x22d3ee, frame = 0x4b5563 } = {}) {
  const group = glowing(
    solid(keyOf("portalFrame", { radius, frame }), () => [torus(radius, 0.13, frame, [0, radius + 0.13, 0])]),
    keyOf("portalRing", { radius }),
    tint,
    3,
    () => [torus(radius - 0.14, 0.05, 0xffffff, [0, radius + 0.13, 0])],
  );
  const surface = new THREE.Mesh(new THREE.CircleGeometry(radius - 0.12, 32), materials.energy(tint, { intensity: 1.2, power: 0.6 }));
  surface.position.y = radius + 0.13;
  group.add(surface);
  return group;
}

// Grass top on dirt, the top surface is at y = 0 and it reaches down by height.
// Solid for physics with game.physics.addStatic(platform).
export function platform({ width = 4, depth = 4, height = 1, top = 0x6cc04a, side = 0x8a5a33 } = {}) {
  return solid(keyOf("platform", { width, depth, height, top, side }), () => [
    box(width, height * 0.8, depth, side, [0, -height * 0.6, 0]),
    box(width + 0.06, height * 0.2, depth + 0.06, top, [0, -height * 0.1, 0]),
  ]);
}

// Characters. All are rigged for anim.rig unless noted.

function limb(geometries, pivot) {
  const mesh = solid(null, () => geometries);
  const holder = new THREE.Group();
  holder.position.set(...pivot);
  holder.add(mesh);
  return holder;
}

function rigged(parts, root) {
  root.parts = parts;
  return root;
}

// 1.8 units tall. Optional hair and hat colors: pass null to leave them off.
export function humanoid({ skin = 0xf0c8a0, shirt = 0x3b82f6, pants = 0x334155, shoes = 0x1f2937, hair = 0x4a2f1b, hat = null } = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.9;
  root.add(body);

  const torsoParts = [box(0.5, 0.65, 0.28, shirt, [0, 0.33, 0])];
  body.add(solid(null, () => torsoParts));

  const headParts = [
    box(0.34, 0.34, 0.32, skin, [0, 0.19, 0]),
    box(0.05, 0.05, 0.02, 0x171717, [-0.08, 0.22, 0.165]),
    box(0.05, 0.05, 0.02, 0x171717, [0.08, 0.22, 0.165]),
  ];
  if (hair !== null) headParts.push(box(0.36, 0.12, 0.34, hair, [0, 0.33, -0.01]), box(0.36, 0.2, 0.08, hair, [0, 0.22, -0.15]));
  if (hat !== null) headParts.push(cylinder(0.22, 0.24, 0.16, hat, [0, 0.42, 0]), box(0.44, 0.03, 0.44, hat, [0, 0.35, 0.02]));
  const head = limb(headParts, [0, 0.67, 0]);
  body.add(head);

  const arm = () => [box(0.15, 0.56, 0.17, shirt, [0, -0.27, 0]), box(0.13, 0.12, 0.15, skin, [0, -0.6, 0])];
  const leg = () => [box(0.2, 0.74, 0.24, pants, [0, -0.37, 0]), box(0.21, 0.14, 0.3, shoes, [0, -0.83, 0.04])];
  const armL = limb(arm(), [-0.34, 0.6, 0]);
  const armR = limb(arm(), [0.34, 0.6, 0]);
  const legL = limb(leg(), [-0.13, 0, 0]);
  const legR = limb(leg(), [0.13, 0, 0]);
  body.add(armL, armR, legL, legR);

  return rigged({ body, head, armL, armR, legL, legR }, root);
}

export function robot({ tint = 0x9ca3af, accent = 0x22d3ee, joints = 0x4b5563 } = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.85;
  root.add(body);

  body.add(solid(null, () => [
    box(0.68, 0.62, 0.42, tint, [0, 0.36, 0]),
    box(0.3, 0.18, 0.02, accent, [0, 0.42, 0.22]),
  ]));
  const head = limb([
    box(0.42, 0.34, 0.38, tint, [0, 0.17, 0]),
    box(0.32, 0.08, 0.02, accent, [0, 0.2, 0.2]),
    cylinder(0.012, 0.012, 0.2, joints, [0.14, 0.42, 0], undefined, 5),
    ball(0.035, accent, [0.14, 0.53, 0], undefined, 0),
  ], [0, 0.7, 0]);
  body.add(head);

  const arm = () => [
    ball(0.12, joints, [0, 0, 0], undefined, 0),
    box(0.15, 0.5, 0.17, tint, [0, -0.3, 0]),
    box(0.2, 0.14, 0.2, joints, [0, -0.6, 0]),
  ];
  const leg = () => [box(0.22, 0.68, 0.26, joints, [0, -0.34, 0]), box(0.26, 0.17, 0.36, tint, [0, -0.77, 0.04])];
  const armL = limb(arm(), [-0.46, 0.56, 0]);
  const armR = limb(arm(), [0.46, 0.56, 0]);
  const legL = limb(leg(), [-0.17, 0, 0]);
  const legR = limb(leg(), [0.17, 0, 0]);
  body.add(armL, armR, legL, legR);

  return rigged({ body, head, armL, armR, legL, legR }, root);
}

// Four legged animal. size scales it, and it works with anim.rig.
export function quadruped({ tint = 0xb98553, belly = 0xe9d7bd, size = 1, ears = "pointed" } = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.6;
  root.add(body);

  body.add(solid(null, () => [
    box(0.42, 0.42, 1, tint, [0, 0.1, 0]),
    box(0.3, 0.06, 0.7, belly, [0, -0.11, 0]),
    box(0.08, 0.08, 0.42, tint, [0, 0.28, -0.66], [0.8, 0, 0]),
  ]));
  const earParts = ears === "pointed"
    ? [cone(0.07, 0.17, tint, [-0.13, 0.26, 0], undefined, 4), cone(0.07, 0.17, tint, [0.13, 0.26, 0], undefined, 4)]
    : [box(0.08, 0.26, 0.1, tint, [-0.2, 0.02, 0]), box(0.08, 0.26, 0.1, tint, [0.2, 0.02, 0])];
  const head = limb([
    box(0.36, 0.34, 0.36, tint, [0, 0.04, 0.08]),
    box(0.2, 0.15, 0.17, belly, [0, -0.04, 0.32]),
    box(0.08, 0.06, 0.03, 0x171717, [0, 0.02, 0.41]),
    box(0.05, 0.05, 0.02, 0x171717, [-0.1, 0.1, 0.265]),
    box(0.05, 0.05, 0.02, 0x171717, [0.1, 0.1, 0.265]),
    ...earParts,
  ], [0, 0.32, 0.54]);
  body.add(head);

  const leg = () => [box(0.14, 0.5, 0.15, tint, [0, -0.25, 0])];
  const legL = limb(leg(), [-0.16, -0.1, 0.38]);
  const legR = limb(leg(), [0.16, -0.1, 0.38]);
  const legBL = limb(leg(), [-0.16, -0.1, -0.38]);
  const legBR = limb(leg(), [0.16, -0.1, -0.38]);
  body.add(legL, legR, legBL, legBR);

  root.scale.setScalar(size);
  return rigged({ body, head, legL, legR, legBL, legBR }, root);
}

// Not rigged, use anim.squash or anim.bob
export function slime({ tint = 0x4ade80, size = 1 } = {}) {
  return solid(keyOf("slime", { tint, size }), () => [
    part(new THREE.SphereGeometry(0.5 * size, 12, 7, 0, TAU, 0, Math.PI / 2), tint),
    cylinder(0.5 * size, 0.46 * size, 0.08 * size, new THREE.Color(tint).offsetHSL(0, 0, -0.08), [0, 0, 0], undefined, 12),
    ball(0.075 * size, 0xffffff, [-0.16 * size, 0.28 * size, 0.38 * size], undefined, 0),
    ball(0.075 * size, 0xffffff, [0.16 * size, 0.28 * size, 0.38 * size], undefined, 0),
    ball(0.04 * size, 0x171717, [-0.16 * size, 0.28 * size, 0.44 * size], undefined, 0),
    ball(0.04 * size, 0x171717, [0.16 * size, 0.28 * size, 0.44 * size], undefined, 0),
  ]);
}

export function ghost({ tint = 0xe5eaf5 } = {}) {
  return solid(keyOf("ghost", { tint }), () => {
    const skirt = [];
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * TAU;
      skirt.push(cone(0.13, 0.28, tint, [Math.sin(angle) * 0.33, 0.14, Math.cos(angle) * 0.33], [Math.PI, 0, 0], 5));
    }
    return [
      part(new THREE.SphereGeometry(0.44, 12, 7, 0, TAU, 0, Math.PI / 2), tint, [0, 0.8, 0]),
      cylinder(0.44, 0.46, 0.55, tint, [0, 0.53, 0], undefined, 12),
      ball(0.075, 0x171717, [-0.15, 0.9, 0.39], undefined, 0),
      ball(0.075, 0x171717, [0.15, 0.9, 0.39], undefined, 0),
      ...skirt,
    ];
  });
}

export function bird({ tint = 0xef4444, wing = 0xb91c1c, beak = 0xf59e0b } = {}) {
  const root = new THREE.Group();
  root.add(solid(keyOf("birdBody", { tint, beak }), () => [
    ball(0.26, tint, [0, 0.3, 0], [0.9, 1, 1.15]),
    cone(0.07, 0.16, beak, [0, 0.32, 0.34], [Math.PI / 2, 0, 0], 5),
    ball(0.04, 0x171717, [-0.14, 0.4, 0.2], undefined, 0),
    ball(0.04, 0x171717, [0.14, 0.4, 0.2], undefined, 0),
    box(0.12, 0.03, 0.26, wing, [0, 0.34, -0.34], [-0.3, 0, 0]),
  ]));
  const wingL = limb([box(0.42, 0.04, 0.26, wing, [-0.21, 0, 0])], [-0.18, 0.36, 0]);
  const wingR = limb([box(0.42, 0.04, 0.26, wing, [0.21, 0, 0])], [0.18, 0.36, 0]);
  root.add(wingL, wingR);
  // Flap with wingL.rotation.z = -wingR.rotation.z
  return rigged({ wingL, wingR }, root);
}

// Vehicles

function wheel(radius, width, position) {
  const holder = limb([
    cylinder(radius, radius, width, 0x1f2937, [0, 0, 0], [0, 0, Math.PI / 2], 12),
    cylinder(radius * 0.55, radius * 0.55, width + 0.02, 0xcbd5e1, [0, 0, 0], [0, 0, Math.PI / 2], 8),
  ], position);
  return holder;
}

// 3.8 long. parts.wheels spin and parts.frontWheels steer under controls.vehicle.
export function car({ tint = 0xdc2626, glass = 0x1e293b } = {}) {
  const root = new THREE.Group();
  root.add(solid(keyOf("car", { tint, glass }), () => [
    box(1.7, 0.5, 3.8, tint, [0, 0.6, 0]),
    box(1.45, 0.48, 1.9, tint, [0, 1.08, -0.25]),
    box(1.46, 0.36, 1.92, glass, [0, 1.09, -0.25]),
    box(1.32, 0.03, 1.72, tint, [0, 1.33, -0.25]),
    box(0.36, 0.13, 0.04, 0xfef3c7, [-0.58, 0.68, 1.91]),
    box(0.36, 0.13, 0.04, 0xfef3c7, [0.58, 0.68, 1.91]),
    box(0.38, 0.12, 0.04, 0xb91c1c, [-0.58, 0.7, -1.91]),
    box(0.38, 0.12, 0.04, 0xb91c1c, [0.58, 0.7, -1.91]),
    box(1.72, 0.12, 3.84, 0x1f2937, [0, 0.36, 0]),
  ]));
  const wheels = [
    wheel(0.38, 0.3, [-0.85, 0.38, 1.25]),
    wheel(0.38, 0.3, [0.85, 0.38, 1.25]),
    wheel(0.38, 0.3, [-0.85, 0.38, -1.25]),
    wheel(0.38, 0.3, [0.85, 0.38, -1.25]),
  ];
  root.add(...wheels);
  // Steering turns the holder, the spin stays on the mesh inside it
  return rigged({ wheels: wheels.map((holder) => holder.children[0]), frontWheels: wheels.slice(0, 2) }, root);
}

export function truck({ tint = 0x2563eb, bed = 0x9ca3af } = {}) {
  const root = new THREE.Group();
  root.add(solid(keyOf("truck", { tint, bed }), () => [
    box(1.9, 1.4, 1.5, tint, [0, 1.3, 1.85]),
    box(1.92, 0.5, 0.05, 0x1e293b, [0, 1.6, 2.6]),
    box(2, 1.7, 3.6, bed, [0, 1.5, -0.8]),
    box(2, 0.25, 5.4, 0x1f2937, [0, 0.55, 0.1]),
  ]));
  const wheels = [[-1, 1.85], [1, 1.85], [-1, -1.6], [1, -1.6]].map(([x, z]) => wheel(0.48, 0.4, [x, 0.48, z]));
  root.add(...wheels);
  return rigged({ wheels: wheels.map((holder) => holder.children[0]), frontWheels: wheels.slice(0, 2) }, root);
}

export function boat({ tint = 0xf8fafc, stripe = 0x2563eb } = {}) {
  return solid(keyOf("boat", { tint, stripe }), () => {
    const hull = new THREE.Shape();
    hull.moveTo(0, 1.5);
    hull.quadraticCurveTo(0.75, 0.7, 0.72, -1.1);
    hull.lineTo(-0.72, -1.1);
    hull.quadraticCurveTo(-0.75, 0.7, 0, 1.5);
    const deck = (height, y, scale, shade) =>
      part(new THREE.ExtrudeGeometry(hull, { depth: height, bevelEnabled: false }), shade, [0, y, 0], [Math.PI / 2, 0, 0], [scale, scale, 1]);
    return [
      deck(0.3, 0.3, 0.92, stripe),
      deck(0.25, 0.55, 1, tint),
      box(0.8, 0.5, 0.8, tint, [0, 0.8, -0.35]),
      box(0.82, 0.2, 0.05, 0x1e293b, [0, 0.9, 0.06]),
    ];
  });
}

// kind: "fighter" or the rounder "shuttle"
export function spaceship({ kind = "fighter", tint = 0xe2e8f0, accent = 0xea580c, engine = 0x38bdf8 } = {}) {
  const hull = solid(keyOf("spaceship", { kind, tint, accent }), () => {
    if (kind === "shuttle") {
      return [
        ball(0.6, tint, [0, 0, 0.1], [0.9, 0.7, 1.6]),
        box(2, 0.08, 0.7, accent, [0, -0.1, -0.2]),
        box(0.08, 0.6, 0.5, accent, [0, 0.45, -0.75]),
        ball(0.26, 0x1e293b, [0, 0.24, 0.6], [1, 0.7, 1]),
      ];
    }
    const wing = (side) => {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0.7);
      shape.lineTo(1.5 * side, -0.8);
      shape.lineTo(1.5 * side, -1.05);
      shape.lineTo(0, -0.7);
      return part(new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false }), accent, [0, 0, 0], [Math.PI / 2, 0, 0]);
    };
    return [
      cone(0.32, 2.2, tint, [0, 0, 0.25], [Math.PI / 2, 0, 0], 6),
      cylinder(0.34, 0.26, 0.5, tint, [0, 0, -1.03], [Math.PI / 2, 0, 0], 6),
      ball(0.17, 0x1e293b, [0, 0.2, 0.15], [1, 0.8, 2]),
      wing(1),
      wing(-1),
      box(0.05, 0.42, 0.42, accent, [0, 0.3, -0.92]),
    ];
  });
  const ship = glowing(hull, keyOf("shipEngine", { kind }), engine, 4, () =>
    kind === "shuttle" ? [cylinder(0.2, 0.2, 0.05, 0xffffff, [0, 0, -0.9], [Math.PI / 2, 0, 0])] : [cylinder(0.22, 0.22, 0.05, 0xffffff, [0, 0, -1.3], [Math.PI / 2, 0, 0], 6)],
  );
  return ship;
}

export function ufo({ tint = 0xa1a1aa, dome = 0x67e8f9, lights = 0xfacc15 } = {}) {
  const lamps = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * TAU;
    lamps.push(ball(0.1, 0xffffff, [Math.sin(angle) * 1.05, -0.08, Math.cos(angle) * 1.05], undefined, 0));
  }
  return glowing(
    solid(keyOf("ufo", { tint, dome }), () => [
      part(new THREE.SphereGeometry(1.4, 16, 8), tint, [0, 0, 0], undefined, [1, 0.24, 1]),
      part(new THREE.SphereGeometry(0.62, 12, 6, 0, TAU, 0, Math.PI / 2), dome, [0, 0.2, 0]),
    ]),
    keyOf("ufoLights", {}),
    lights,
    3,
    () => lamps,
  );
}

export function plane({ tint = 0xf8fafc, accent = 0xdc2626 } = {}) {
  return solid(keyOf("plane", { tint, accent }), () => [
    cylinder(0.26, 0.14, 2.8, tint, [0, 0, 0], [Math.PI / 2, 0, 0], 10),
    cone(0.26, 0.5, accent, [0, 0, 1.65], [Math.PI / 2, 0, 0], 10),
    box(3.4, 0.07, 0.7, accent, [0, 0.05, 0.25]),
    box(1.2, 0.05, 0.36, accent, [0, 0.08, -1.2]),
    box(0.05, 0.46, 0.42, accent, [0, 0.28, -1.22]),
  ]);
}

// Ground

// Flat floor. Pass any material, for example materials.textured("grass", { repeat: 20 }).
export function ground({ size = 200, tint = 0x74a85c, material } = {}) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material ?? materials.lowPoly(tint));
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}

export function water({ size = 200, tint = 0x2a8fbd, level = 0, repeat } = {}) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), materials.water(tint, { repeat: repeat ?? Math.max(2, Math.round(size / 16)) }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = level;
  return mesh;
}

const TERRAIN_BANDS = [
  [0.3, 0xdcc48e],
  [0.42, 0x7ab55c],
  [0.62, 0x5a9446],
  [0.78, 0x7d7a73],
  [1, 0xf2f5f8],
];

// Hills. terrain.heightAt(x, z) gives the surface height: set game.physics.ground to it.
// bands: [[share of height, color], ...] sorted from low to high.
export function terrain({ size = 200, segments = 100, height = 18, scale = 5, seed = 1, bands = TERRAIN_BANDS } = {}) {
  const row = segments + 1;
  const heights = new Float32Array(row * row);
  for (let z = 0; z < row; z++) {
    for (let x = 0; x < row; x++) {
      heights[z * row + x] = fbm((x / segments) * scale, (z / segments) * scale, { octaves: 5, seed }) ** 1.6 * height * 1.6;
    }
  }

  const geometry = new THREE.PlaneGeometry(size, size, segments, segments).rotateX(-Math.PI / 2);
  const { position } = geometry.attributes;
  for (let i = 0; i < position.count; i++) position.setY(i, heights[i]);

  const flat = geometry.toNonIndexed();
  flat.deleteAttribute("uv");
  const corners = flat.attributes.position;
  const colors = new Float32Array(corners.count * 3);
  for (let i = 0; i < corners.count; i += 3) {
    const average = (corners.getY(i) + corners.getY(i + 1) + corners.getY(i + 2)) / 3 / (height * 1.6);
    color.set(bands.find(([limit]) => average <= limit)?.[1] ?? bands.at(-1)[1]);
    for (let j = 0; j < 3; j++) colors.set([color.r, color.g, color.b], (i + j) * 3);
  }
  flat.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  flat.computeVertexNormals();

  const mesh = new THREE.Mesh(flat, materials.painted());
  mesh.receiveShadow = true;
  const half = size / 2;
  mesh.heightAt = (x, z) => {
    const gridX = Math.max(0, Math.min(segments - 0.001, ((x + half) / size) * segments));
    const gridZ = Math.max(0, Math.min(segments - 0.001, ((z + half) / size) * segments));
    const col = Math.floor(gridX);
    const line = Math.floor(gridZ);
    const fx = gridX - col;
    const fz = gridZ - line;
    const at = (c, l) => heights[l * row + c];
    return lerp(lerp(at(col, line), at(col + 1, line), fx), lerp(at(col, line + 1), at(col + 1, line + 1), fx), fz);
  };
  return mesh;
}

// Billboard text in the world
export function text(content, { height = 1, color: tint = "#ffffff", background = null } = {}) {
  const map = textures.label(content, { color: tint, background });
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false }));
  sprite.scale.set(height * map.userData.aspect, height, 1);
  return sprite;
}

// Many copies of a model in a few draw calls. Works on single meshes and on models with
// glowing parts, not on rigged ones. place(dummy, i) sets dummy's position, rotation and scale.
export function instanced(model, count, place) {
  const group = new THREE.Group();
  const dummy = new THREE.Object3D();
  const instance = new THREE.Matrix4();
  model.updateMatrixWorld(true);

  model.traverse((node) => {
    if (!node.isMesh) return;
    const mesh = new THREE.InstancedMesh(node.geometry, node.material, count);
    mesh.castShadow = node.castShadow;
    mesh.receiveShadow = node.receiveShadow;
    for (let i = 0; i < count; i++) {
      dummy.position.set(0, 0, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      place(dummy, i);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, instance.multiplyMatrices(dummy.matrix, node.matrixWorld));
    }
    mesh.computeBoundingSphere();
    group.add(mesh);
  });
  return group;
}

// Random copies across a square. Give heightAt to sit them on a terrain, and keepOut to
// skip spots: keepOut: (x, z) => Math.hypot(x, z) < 8 keeps the spawn clear.
export function scatter(model, { count = 60, area = 80, seed = 1, heightAt = null, scale = [0.8, 1.3], keepOut = null } = {}) {
  const rng = createRng(seed);
  const spots = [];
  for (let tries = 0; spots.length < count && tries < count * 20; tries++) {
    const x = rng.range(-area / 2, area / 2);
    const z = rng.range(-area / 2, area / 2);
    if (keepOut?.(x, z)) continue;
    spots.push({ x, z, angle: rng.range(0, TAU), size: rng.range(scale[0], scale[1]) });
  }
  return instanced(model, spots.length, (dummy, i) => {
    const { x, z, angle, size } = spots[i];
    dummy.position.set(x, heightAt ? heightAt(x, z) : 0, z);
    dummy.rotation.y = angle;
    dummy.scale.setScalar(size);
  });
}
