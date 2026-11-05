// Pure helpers. Nothing here touches the scene or the game loop.
import * as THREE from "three";

export const TAU = Math.PI * 2;

export const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, value) => (a === b ? 0 : (value - a) / (b - a));
export const remap = (value, inMin, inMax, outMin, outMax) =>
  lerp(outMin, outMax, clamp(invLerp(inMin, inMax, value)));
export const smoothstep = (min, max, value) => {
  const t = clamp(invLerp(min, max, value));
  return t * t * (3 - 2 * t);
};
export const wrap = (value, min, max) => {
  const range = max - min;
  return ((((value - min) % range) + range) % range) + min;
};
export const deg = (degrees) => (degrees * Math.PI) / 180;
export const moveToward = (value, target, step) =>
  Math.abs(target - value) <= step ? target : value + Math.sign(target - value) * step;

// Frame rate independent smoothing: higher lambda catches up faster
export const damp = (value, target, lambda, dt) =>
  lerp(value, target, 1 - Math.exp(-lambda * dt));

export const wrapAngle = (angle) => wrap(angle, -Math.PI, Math.PI);
export const angleDelta = (from, to) => wrapAngle(to - from);
export const dampAngle = (angle, target, lambda, dt) =>
  angle + angleDelta(angle, target) * (1 - Math.exp(-lambda * dt));

export function dampVec3(vector, target, lambda, dt) {
  return vector.lerp(target, 1 - Math.exp(-lambda * dt));
}

// [x, y, z], {x, y, z}, an Object3D or a number (all axes) to a new Vector3
export function vec3(value = 0, y, z) {
  if (typeof value === "number") {
    return y === undefined ? new THREE.Vector3(value, value, value) : new THREE.Vector3(value, y, z);
  }
  if (Array.isArray(value)) return new THREE.Vector3(value[0], value[1], value[2]);
  if (value.isObject3D) return value.getWorldPosition(new THREE.Vector3());
  return new THREE.Vector3(value.x, value.y, value.z);
}

// Ground-plane helpers. Models face +Z, so yaw = 0 looks down +Z.
export const distanceXZ = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const yawTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);

export const rand = (min = 1, max) =>
  max === undefined ? Math.random() * min : min + Math.random() * (max - min);
export const randInt = (min, max) => Math.floor(rand(min, max + 1));
export const pick = (list) => list[Math.floor(Math.random() * list.length)];
export const chance = (probability) => Math.random() < probability;
export function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
export function randomInCircle(radius = 1) {
  const angle = Math.random() * TAU;
  const r = Math.sqrt(Math.random()) * radius;
  return { x: Math.cos(angle) * r, z: Math.sin(angle) * r };
}
export function randomOnSphere(radius = 1, target = new THREE.Vector3()) {
  const y = Math.random() * 2 - 1;
  const r = Math.sqrt(1 - y * y);
  const angle = Math.random() * TAU;
  return target.set(Math.cos(angle) * r * radius, y * radius, Math.sin(angle) * r * radius);
}

// Seeded generator for levels that must come out the same every time
export function createRng(seed = 1) {
  let state = seed >>> 0 || 1;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (probability) => next() < probability,
  };
}

function hash2(x, y, seed) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Value noise in 0..1. With a period the result tiles, which textures rely on.
export function noise2D(x, y, seed = 0, period = 0) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const cell = (cx, cy) =>
    period ? hash2(wrap(cx, 0, period), wrap(cy, 0, period), seed) : hash2(cx, cy, seed);
  return lerp(
    lerp(cell(ix, iy), cell(ix + 1, iy), sx),
    lerp(cell(ix, iy + 1), cell(ix + 1, iy + 1), sx),
    sy,
  );
}

export function fbm(x, y, { octaves = 4, seed = 0, period = 0 } = {}) {
  let sum = 0;
  let amplitude = 0.5;
  let total = 0;
  let frequency = 1;
  for (let i = 0; i < octaves; i++) {
    sum += noise2D(x * frequency, y * frequency, seed + i, period * frequency) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / total;
}
