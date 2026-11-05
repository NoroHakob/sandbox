// Tweens and procedural motion. Everything here stops on game.clear().
import * as THREE from "three";

import { damp, TAU } from "./math.js";
import * as materials from "./materials.js";

const c1 = 1.70158;
const c3 = c1 + 1;

export const easings = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) ** 2,
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  inCubic: (t) => t ** 3,
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOutCubic: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  inBack: (t) => c3 * t ** 3 - c1 * t * t,
  outBack: (t) => 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2,
  outElastic: (t) =>
    t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin(((t * 10 - 0.75) * TAU) / 3) + 1,
  outBounce: (t) => {
    const n = 7.5625;
    const d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
};

// Numbers, colors, nested objects, and [x, y, z] for vectors and rotations
function collectTracks(target, to, tracks) {
  for (const [key, end] of Object.entries(to)) {
    const current = target[key];
    if (typeof current === "number") {
      tracks.push({ owner: target, key, from: current, to: end });
    } else if (current?.isColor) {
      tracks.push({ color: current, from: current.clone(), to: new THREE.Color(end) });
    } else if (Array.isArray(end)) {
      collectTracks(current, { x: end[0], y: end[1], z: end[2] }, tracks);
    } else if (typeof current === "object" && current !== null) {
      collectTracks(current, end, tracks);
    }
  }
  return tracks;
}

// await-able: `await anim.tween(game, mesh.position, { y: 2 }, { duration: 0.3 })`
export function tween(game, target, to, options = {}) {
  const { duration = 0.4, ease = "outQuad", delay = 0, repeat = 0, yoyo = false, onUpdate, onComplete } = options;
  const curve = easings[ease] ?? ease;
  let tracks = null;
  let elapsed = -delay;
  let cycle = 0;
  let finish;
  const finished = new Promise((resolve) => (finish = resolve));

  const task = game.task((dt) => {
    elapsed += dt;
    if (elapsed < 0) return true;
    tracks ??= collectTracks(target, to, []);

    const t = Math.min(elapsed / duration, 1);
    const reversed = yoyo && cycle % 2 === 1;
    const eased = curve(reversed ? 1 - t : t);
    for (const track of tracks) {
      if (track.color) track.color.lerpColors(track.from, track.to, eased);
      else track.owner[track.key] = track.from + (track.to - track.from) * eased;
    }
    onUpdate?.(eased);

    if (t < 1) return true;
    if (cycle < repeat) {
      cycle++;
      elapsed -= duration;
      return true;
    }
    onComplete?.();
    finish();
    return false;
  });

  return {
    stop: task.stop,
    then: (resolve, reject) => finished.then(resolve, reject),
  };
}

export const spin = (game, object, speed = 1, axis = "y") =>
  game.task((dt) => {
    object.rotation[axis] += speed * dt;
  });

export function bob(game, object, { height = 0.2, speed = 2 } = {}) {
  const base = object.position.y;
  const phase = Math.random() * TAU;
  return game.task(() => {
    object.position.y = base + Math.sin(game.time * speed + phase) * height;
  });
}

export function pulse(game, object, { amount = 0.1, speed = 4 } = {}) {
  const base = object.scale.clone();
  return game.task(() => {
    object.scale.copy(base).multiplyScalar(1 + Math.sin(game.time * speed) * amount);
  });
}

// Scales in from nothing with a little overshoot
export function pop(game, object, { duration = 0.35, delay = 0 } = {}) {
  const { x, y, z } = object.scale;
  object.scale.setScalar(0.001);
  return tween(game, object.scale, { x, y, z }, { duration, delay, ease: "outBack" });
}

// Squash and stretch, for landings and hits
export async function squash(game, object, { amount = 0.3, duration = 0.22 } = {}) {
  const { x, y, z } = object.scale;
  const wide = 1 + amount;
  await tween(game, object.scale, { x: x * wide, y: y * (1 - amount), z: z * wide }, { duration: duration * 0.35 });
  await tween(game, object.scale, { x, y, z }, { duration: duration * 0.65, ease: "outBack" });
}

// Shrinks away, then removes the object from the game
export async function vanish(game, object, { duration = 0.25 } = {}) {
  await tween(game, object.scale, { x: 0.001, y: 0.001, z: 0.001 }, { duration, ease: "inBack" });
  game.remove(object);
}

// Paints the object one flat color for a moment, works on shared materials
export function flash(game, object, { color = 0xffffff, duration = 0.1 } = {}) {
  const swapped = new Map();
  const overlay = materials.unlit(color);
  object.traverse((node) => {
    if (!node.isMesh || node.userData.flashing) return;
    node.userData.flashing = true;
    swapped.set(node, node.material);
    node.material = overlay;
  });
  game.after(duration, () => {
    for (const [node, material] of swapped) {
      node.material = material;
      node.userData.flashing = false;
    }
  });
}

// Moves through points along a smooth curve. loop: "repeat", "pingpong" or false.
export function path(game, object, points, { duration = 4, loop = "pingpong", ease = "inOutSine", face = false } = {}) {
  const closed = loop === "repeat";
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)), closed);
  const tangent = new THREE.Vector3();
  const curveEase = easings[ease] ?? ease;
  let elapsed = 0;
  return game.task((dt) => {
    elapsed += dt;
    const raw = elapsed / duration;
    let t = raw % 1;
    if (loop === "pingpong" && Math.floor(raw) % 2 === 1) t = 1 - t;
    if (!loop && raw >= 1) t = 1;
    const u = closed ? t : curveEase(t);
    curve.getPointAt(u, object.position);
    if (face) {
      curve.getTangentAt(u, tangent);
      object.rotation.y = Math.atan2(tangent.x, tangent.z);
    }
    return loop || raw < 1;
  });
}

// Target rotation.x per limb, in radians. t is the phase of the cycle.
const POSES = {
  idle: (t) => ({ armL: Math.sin(t * 1.6) * 0.04, armR: -Math.sin(t * 1.6) * 0.04, lift: Math.sin(t * 1.6) * 0.012 }),
  walk: (t) => ({ legL: Math.sin(t * 8) * 0.6, legR: -Math.sin(t * 8) * 0.6, armL: -Math.sin(t * 8) * 0.5, armR: Math.sin(t * 8) * 0.5, lift: Math.abs(Math.cos(t * 8)) * 0.04 }),
  run: (t) => ({ legL: Math.sin(t * 13) * 1.05, legR: -Math.sin(t * 13) * 1.05, armL: -Math.sin(t * 13) * 0.95, armR: Math.sin(t * 13) * 0.95, lift: Math.abs(Math.cos(t * 13)) * 0.09, lean: 0.14 }),
  jump: () => ({ legL: -0.75, legR: 0.3, armL: -2.5, armR: -2.5 }),
  fall: () => ({ legL: 0.25, legR: -0.25, armL: -2, armR: -2 }),
  wave: (t) => ({ armR: -2.7 + Math.sin(t * 10) * 0.3 }),
  dance: (t) => ({ armL: -2.6 + Math.sin(t * 9) * 0.5, armR: -2.6 - Math.sin(t * 9) * 0.5, legL: Math.sin(t * 9) * 0.2, legR: -Math.sin(t * 9) * 0.2, lift: Math.abs(Math.sin(t * 9)) * 0.1 }),
  die: () => ({ lean: -1.5, armL: -1, armR: -1.2, legL: 0.2, legR: -0.1, sink: -0.75 }),
};

// One-shot moves play over the current pose. Each has a length and a pose over p in 0..1.
const MOVES = {
  attack: { length: 0.32, pose: (p) => ({ armR: p < 0.35 ? -2.8 : 0.5 }) },
  hit: { length: 0.25, pose: () => ({ lean: -0.35 }) },
};

// Drives a model made by models.humanoid, robot or quadruped: rig.play("walk"), rig.play("attack").
export function rig(game, model, { state = "idle", speed = 1 } = {}) {
  const { parts = {} } = model;
  const base = { bodyY: parts.body?.position.y ?? 0, bodyX: parts.body?.rotation.x ?? 0 };
  let move = null;
  let moveTime = 0;
  let phase = Math.random() * 10;

  const set = (part, value, lambda, dt) => {
    if (part) part.rotation.x = damp(part.rotation.x, value, lambda, dt);
  };

  const controller = {
    state,
    speed,
    play(next) {
      if (MOVES[next]) {
        move = MOVES[next];
        moveTime = 0;
      } else if (POSES[next]) {
        controller.state = next;
      } else {
        throw new Error(`Unknown rig state "${next}"`);
      }
    },
  };

  game.task((dt) => {
    phase += dt * controller.speed;
    let pose = POSES[controller.state](phase);
    if (move) {
      moveTime += dt;
      const progress = moveTime / move.length;
      if (progress >= 1) move = null;
      else pose = { ...pose, ...move.pose(progress) };
    }

    const lambda = 16;
    set(parts.legL, pose.legL ?? 0, lambda, dt);
    set(parts.legR, pose.legR ?? 0, lambda, dt);
    set(parts.armL, pose.armL ?? 0, lambda, dt);
    set(parts.armR, pose.armR ?? 0, lambda, dt);
    // Quadrupeds: rear legs move in the opposite phase of the front legs
    set(parts.legBL, pose.legR ?? 0, lambda, dt);
    set(parts.legBR, pose.legL ?? 0, lambda, dt);
    if (parts.body) {
      parts.body.position.y = damp(parts.body.position.y, base.bodyY + (pose.lift ?? 0) + (pose.sink ?? 0), lambda, dt);
      parts.body.rotation.x = damp(parts.body.rotation.x, base.bodyX + (pose.lean ?? 0), lambda, dt);
    }
  });

  return controller;
}
