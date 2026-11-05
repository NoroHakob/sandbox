// Ready-made player movement and cameras. Each one takes game first, runs itself every
// frame, and stops on game.clear(). A target is an Object3D, an entity or a physics body.
import * as THREE from "three";

import { clamp, damp, dampAngle, dampVec3, moveToward, vec3 } from "./math.js";

const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function resolve(target) {
  if (target.isObject3D) return { object: target, body: null };
  if (target.isBody) return { object: target.object, body: target };
  return { object: target.object, body: target.body ?? null };
}

// Anything with a position, or a fixed point given as [x, y, z]
function focusOf(target) {
  if (Array.isArray(target)) return vec3(target);
  if (target.isVector3) return target;
  return resolve(target).object.position;
}

// Camera that trails a target. rotate: true turns the offset with the target, for
// racing: models face +Z, so behind them is a negative z, which is the default then.
export function follow(game, target, { offset, lookOffset = [0, 1, 0], smooth = 6, rotate = false, lookAhead = 0, camera = game.camera } = {}) {
  const { object } = resolve(target);
  offset ??= rotate ? [0, 4, -9] : [0, 6, 10];
  const base = vec3(offset);
  const look = vec3(lookOffset);
  const place = new THREE.Vector3();
  const aim = object.position.clone().add(look);
  const applyOffset = (out) => {
    out.copy(base);
    if (rotate) out.applyAxisAngle(UP, object.rotation.y);
    return out.add(object.position);
  };
  camera.position.copy(applyOffset(place));
  camera.lookAt(aim);

  const task = game.task((dt) => {
    applyOffset(place);
    dampVec3(camera.position, place, smooth, dt);
    forward.set(Math.sin(object.rotation.y), 0, Math.cos(object.rotation.y));
    place.copy(object.position).add(look).addScaledVector(forward, lookAhead);
    dampVec3(aim, place, smooth * 2, dt);
    camera.lookAt(aim);
  });
  return { stop: task.stop, offset: base, lookOffset: look };
}

// Camera on a sphere around a target. Drag to look around and scroll to zoom; with
// lock: true a click captures the mouse, which makes it a third-person camera.
export function orbit(game, target = [0, 0, 0], {
  distance = 10,
  minDistance = 3,
  maxDistance = 40,
  yaw = 0,
  pitch = 0.45,
  minPitch = -0.2,
  maxPitch = 1.45,
  sensitivity = 0.005,
  autoRotate = 0,
  lock = false,
  height = 1.2,
  smooth = 14,
  camera = game.camera,
} = {}) {
  const focus = focusOf(target);
  const state = { yaw, pitch, distance, stop: null };
  const aim = focus.clone();
  const place = new THREE.Vector3();
  const { input, canvas } = game;
  let currentDistance = distance;

  const requestLock = () => input.lockPointer();
  if (lock) canvas.addEventListener("click", requestLock);

  const task = game.task((dt) => {
    const { pointer } = input;
    if (pointer.locked || pointer.down) {
      state.yaw -= pointer.dx * sensitivity;
      state.pitch = clamp(state.pitch + pointer.dy * sensitivity, minPitch, maxPitch);
    } else if (autoRotate) {
      state.yaw += autoRotate * dt;
    }
    state.distance = clamp(state.distance * (1 + pointer.wheel * 0.1), minDistance, maxDistance);
    currentDistance = damp(currentDistance, state.distance, 10, dt);

    place.copy(focus).setY(focus.y + height);
    dampVec3(aim, place, smooth, dt);

    const flat = Math.cos(state.pitch) * currentDistance;
    camera.position.set(
      aim.x + Math.sin(state.yaw) * flat,
      aim.y + Math.sin(state.pitch) * currentDistance,
      aim.z + Math.cos(state.yaw) * flat,
    );
    camera.lookAt(aim);
  });

  state.stop = () => {
    task.stop();
    canvas.removeEventListener("click", requestLock);
  };
  return state;
}

// Mouse look and walking. Pass an entity with a body to walk through the level;
// click to capture the mouse (drag works too, for touch).
export function firstPerson(game, target, { speed = 7, runMultiplier = 1.6, jump = 11, height = 1.65, sensitivity = 0.0024, yaw = 0, pitch = 0, camera = game.camera } = {}) {
  const { object, body } = resolve(target);
  const { input, canvas } = game;
  const state = { yaw, pitch, moving: false, stop: null };
  const requestLock = () => input.lockPointer();
  canvas.addEventListener("click", requestLock);
  camera.rotation.order = "YXZ";

  const task = game.task((dt) => {
    const { pointer } = input;
    if (pointer.locked || pointer.down) {
      state.yaw -= pointer.dx * sensitivity;
      state.pitch = clamp(state.pitch - pointer.dy * sensitivity, -1.5, 1.5);
    }

    const axis = input.axis();
    const pace = speed * (input.down("run") ? runMultiplier : 1);
    forward.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
    right.set(-forward.z, 0, forward.x);
    const moveX = (forward.x * axis.y + right.x * axis.x) * pace;
    const moveZ = (forward.z * axis.y + right.z * axis.x) * pace;
    state.moving = axis.x !== 0 || axis.y !== 0;

    if (body) {
      body.velocity.x = moveX;
      body.velocity.z = moveZ;
      if (jump && body.grounded && input.pressed("jump")) body.velocity.y = jump;
    } else {
      object.position.x += moveX * dt;
      object.position.z += moveZ * dt;
    }

    object.rotation.y = state.yaw + Math.PI;
    camera.position.set(object.position.x, object.position.y + height, object.position.z);
    camera.rotation.set(state.pitch, state.yaw, 0);
  });

  state.stop = () => {
    task.stop();
    canvas.removeEventListener("click", requestLock);
  };
  return state;
}

// Walking and jumping, with the forgiving timing that makes jumps feel good.
// camera: walk relative to the view (default); pass null for fixed world directions.
// axis: "x" limits movement to one line, for side-scrollers.
// rig: an anim.rig to drive idle, run, jump and fall.
export function character(game, target, {
  speed = 7,
  runMultiplier = 1.5,
  acceleration = 60,
  airControl = 0.6,
  turnSpeed = 14,
  jump = 12,
  jumps = 1, // 2 for a double jump
  coyoteTime = 0.1,
  jumpBuffer = 0.12,
  jumpCut = 0.5, // Releasing early keeps this share of the rise, 1 turns it off
  axis: lineAxis = null,
  camera = game.camera,
  rig = null,
  onJump = null,
  onLand = null,
} = {}) {
  const { object, body } = resolve(target);
  const { input } = game;
  const state = { enabled: true, moving: false, grounded: true, jumpsUsed: 0, facing: object.rotation.y, stop: null };
  let coyote = 0;
  let buffered = 0;
  let wasGrounded = true;

  const task = game.task((dt) => {
    const move = state.enabled ? input.axis() : { x: 0, y: 0 };
    let moveX = move.x;
    let moveZ = -move.y;

    if (lineAxis) {
      moveZ = 0;
    } else if (camera) {
      camera.getWorldDirection(forward).setY(0);
      // A camera looking straight down has no forward on the ground, so up means -Z
      if (forward.lengthSq() < 0.0001) forward.set(0, 0, -1);
      forward.normalize();
      right.crossVectors(forward, UP);
      moveX = right.x * move.x + forward.x * move.y;
      moveZ = right.z * move.x + forward.z * move.y;
    }

    const pace = speed * (state.enabled && input.down("run") ? runMultiplier : 1);
    state.moving = moveX !== 0 || moveZ !== 0;
    if (state.moving) state.facing = Math.atan2(moveX, moveZ);
    object.rotation.y = dampAngle(object.rotation.y, state.facing, turnSpeed, dt);

    if (!body) {
      object.position.x += moveX * pace * dt;
      object.position.z += moveZ * pace * dt;
      if (rig) rig.play(state.moving ? "run" : "idle");
      return;
    }

    const grounded = body.grounded;
    const change = acceleration * (grounded ? 1 : airControl) * dt;
    body.velocity.x = moveToward(body.velocity.x, moveX * pace, change);
    body.velocity.z = moveToward(body.velocity.z, moveZ * pace, change);

    if (grounded) {
      coyote = coyoteTime;
      state.jumpsUsed = 0;
    } else {
      coyote -= dt;
    }

    buffered = state.enabled && input.pressed("jump") ? jumpBuffer : buffered - dt;
    const canJump = coyote > 0 || (state.jumpsUsed > 0 && state.jumpsUsed < jumps);
    if (jump && buffered > 0 && canJump) {
      body.velocity.y = jump;
      body.grounded = false;
      state.jumpsUsed++;
      buffered = 0;
      coyote = 0;
      onJump?.();
    }
    if (input.released("jump") && body.velocity.y > 0) body.velocity.y *= jumpCut;

    if (grounded && !wasGrounded) onLand?.();
    wasGrounded = grounded;
    state.grounded = grounded;

    if (rig) {
      if (!grounded) rig.play(body.velocity.y > 0 ? "jump" : "fall");
      else rig.play(state.moving ? "run" : "idle");
    }
  });

  state.stop = task.stop;
  return state;
}

// Arcade car or boat: up/down for throttle, left/right to steer
export function vehicle(game, target, { acceleration = 16, maxSpeed = 30, reverseSpeed = 10, turnRate = 2.1, drag = 0.7, grip = 8 } = {}) {
  const { object, body } = resolve(target);
  const { input } = game;
  const state = { enabled: true, speed: 0, heading: object.rotation.y, stop: null };
  const velocity = new THREE.Vector3();

  const task = game.task((dt) => {
    const move = state.enabled ? input.axis() : { x: 0, y: 0 };
    state.speed += move.y * acceleration * dt;
    state.speed *= Math.exp(-drag * (move.y === 0 ? 1 : 0.15) * dt);
    state.speed = clamp(state.speed, -reverseSpeed, maxSpeed);

    const steering = clamp(state.speed / 6, -1, 1);
    state.heading -= move.x * turnRate * steering * dt;
    object.rotation.y = state.heading;

    forward.set(Math.sin(state.heading), 0, Math.cos(state.heading));
    velocity.lerp(forward.multiplyScalar(state.speed), 1 - Math.exp(-grip * dt));

    if (body) {
      body.velocity.x = velocity.x;
      body.velocity.z = velocity.z;
    } else {
      object.position.addScaledVector(velocity, dt);
    }

    for (const wheel of object.parts?.wheels ?? []) wheel.rotation.x += (state.speed * dt) / 0.4;
    for (const wheel of object.parts?.frontWheels ?? []) wheel.rotation.y = -move.x * 0.4;
  });

  state.stop = task.stop;
  return state;
}
