// Kinematic box physics for character games: gravity, ground and solid colliders.
// It is not a rigid body solver. A body's object.position is the center of its feet.
import * as THREE from "three";

const CELL = 4;
const STEP = 1 / 60;
const GROUND_SNAP = 0.3;
const SKIN = 0.0001;
const box = new THREE.Box3();

// Box3.intersectsBox also counts touching, which would make a body resting
// against a wall collide with it on every step along that wall
function penetrates(a, b) {
  return (
    a.min.x < b.max.x - SKIN && a.max.x > b.min.x + SKIN &&
    a.min.y < b.max.y - SKIN && a.max.y > b.min.y + SKIN &&
    a.min.z < b.max.z - SKIN && a.max.z > b.min.z + SKIN
  );
}

const cellKey = (x, z) => x * 73856093 ^ z * 19349663;

class Collider {
  constructor(object, options) {
    this.object = object;
    this.box = options.box ?? new THREE.Box3();
    this.moving = options.moving ?? false;
    this.delta = new THREE.Vector3();
    this.onHit = options.onHit ?? null;
    this.lastPosition = new THREE.Vector3();
    this.refit();
    this.delta.set(0, 0, 0);
  }

  refit() {
    if (!this.object) return;
    this.object.updateWorldMatrix(true, true);
    this.box.setFromObject(this.object);
    this.delta.subVectors(this.object.position, this.lastPosition);
    this.lastPosition.copy(this.object.position);
  }
}

export class Body {
  isBody = true;

  constructor(object, { size = [1, 2, 1], gravity = 1, bounce = 0, drag = 0, onHit = null } = {}) {
    this.object = object;
    this.halfX = size[0] / 2;
    this.height = size[1];
    this.halfZ = size[2] / 2;
    this.velocity = new THREE.Vector3();
    this.gravity = gravity; // multiplies the world gravity, 0 turns it off
    this.bounce = bounce;
    this.drag = drag;
    this.onHit = onHit; // (collider, axis) => void, for every solid touched
    this.grounded = false;
    this.platform = null; // the moving collider under this body
  }

  get position() {
    return this.object.position;
  }

  toBox(target = box) {
    const { x, y, z } = this.object.position;
    target.min.set(x - this.halfX, y, z - this.halfZ);
    target.max.set(x + this.halfX, y + this.height, z + this.halfZ);
    return target;
  }
}

export class PhysicsWorld {
  constructor({ gravity = -30 } = {}) {
    this.gravity = gravity;
    this.ground = 0; // Height, (x, z) => height from terrain.heightAt, or null for bottomless pits
    this.bodies = [];
    this.moving = [];
    this.cells = new Map();
  }

  addBody(object, options) {
    const body = new Body(object, options);
    this.bodies.push(body);
    return body;
  }

  removeBody(body) {
    const index = this.bodies.indexOf(body);
    if (index >= 0) this.bodies.splice(index, 1);
  }

  // Solid box from an Object3D's bounds, or from a Box3 / { min, max } via options.box.
  // Set moving: true for platforms, they refit each step and carry their riders.
  addStatic(object, options = {}) {
    const collider = new Collider(object, options);
    if (collider.moving) {
      this.moving.push(collider);
      return collider;
    }
    this.forEachCell(collider.box, (key) => {
      const list = this.cells.get(key);
      if (list) list.push(collider);
      else this.cells.set(key, [collider]);
    });
    return collider;
  }

  removeStatic(collider) {
    const movingIndex = this.moving.indexOf(collider);
    if (movingIndex >= 0) this.moving.splice(movingIndex, 1);
    this.forEachCell(collider.box, (key) => {
      const list = this.cells.get(key);
      if (!list) return;
      const index = list.indexOf(collider);
      if (index >= 0) list.splice(index, 1);
    });
  }

  clear() {
    this.bodies.length = 0;
    this.moving.length = 0;
    this.cells.clear();
  }

  forEachCell(bounds, visit) {
    const minX = Math.floor(bounds.min.x / CELL);
    const maxX = Math.floor(bounds.max.x / CELL);
    const minZ = Math.floor(bounds.min.z / CELL);
    const maxZ = Math.floor(bounds.max.z / CELL);
    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) visit(cellKey(x, z));
    }
  }

  nearby(bounds) {
    const found = new Set(this.moving);
    this.forEachCell(bounds, (key) => {
      for (const collider of this.cells.get(key) ?? []) found.add(collider);
    });
    return found;
  }

  groundAt(x, z) {
    if (this.ground === null) return -Infinity;
    return typeof this.ground === "function" ? this.ground(x, z) : this.ground;
  }

  // True when the box touches a solid, e.g. to check a spawn point is free
  overlaps(bounds) {
    for (const collider of this.nearby(bounds)) {
      if (penetrates(collider.box, bounds)) return true;
    }
    return false;
  }

  moveAxis(body, axis, distance) {
    if (distance === 0) return;
    const position = body.object.position;
    position[axis] += distance;

    const bounds = body.toBox();
    for (const collider of this.nearby(bounds)) {
      if (!penetrates(collider.box, bounds)) continue;

      // Deeper than this step means it was already inside, and pushing it out along
      // this axis would teleport it. It gets to walk out instead.
      const rising = distance > 0;
      const depth = rising ? bounds.max[axis] - collider.box.min[axis] : collider.box.max[axis] - bounds.min[axis];
      if (depth > Math.abs(distance) + SKIN) continue;

      if (axis === "x") position.x = (rising ? collider.box.min.x - body.halfX : collider.box.max.x + body.halfX);
      if (axis === "z") position.z = (rising ? collider.box.min.z - body.halfZ : collider.box.max.z + body.halfZ);
      if (axis === "y") {
        position.y = rising ? collider.box.min.y - body.height : collider.box.max.y;
        if (!rising) {
          body.grounded = true;
          if (collider.moving) body.platform = collider;
        }
      }

      body.velocity[axis] = rising === body.velocity[axis] > 0 ? -body.velocity[axis] * body.bounce : body.velocity[axis];
      collider.onHit?.(body, axis);
      body.onHit?.(collider, axis);
      body.toBox(bounds);
    }
  }

  stepBody(body, dt) {
    const { velocity } = body;
    const position = body.object.position;
    const wasGrounded = body.grounded;

    if (body.platform) {
      position.add(body.platform.delta);
      body.platform = null;
    }

    velocity.y += this.gravity * body.gravity * dt;
    if (body.drag) {
      const keep = Math.exp(-body.drag * dt);
      velocity.x *= keep;
      velocity.z *= keep;
    }

    body.grounded = false;
    this.moveAxis(body, "x", velocity.x * dt);
    this.moveAxis(body, "z", velocity.z * dt);
    this.moveAxis(body, "y", velocity.y * dt);

    const height = this.groundAt(position.x, position.z);
    const onGround =
      position.y <= height ||
      (wasGrounded && velocity.y <= 0 && position.y - height < GROUND_SNAP);
    if (onGround) {
      position.y = height;
      if (velocity.y < 0) velocity.y = velocity.y < -2 ? -velocity.y * body.bounce : 0;
      body.grounded = true;
    }
  }

  step(dt) {
    const steps = Math.ceil(dt / STEP);
    const stepDt = dt / steps;
    for (let i = 0; i < steps; i++) {
      for (const collider of this.moving) collider.refit();
      for (const body of this.bodies) this.stepBody(body, stepDt);
    }
  }
}
