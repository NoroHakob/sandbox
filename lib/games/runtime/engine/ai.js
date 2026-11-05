// Enemy behaviour. Steering helpers are called from an update each frame and take
// an entity. They set entity.body.velocity when it has a body, and move it otherwise.
import { angleDelta, dampAngle, distanceXZ, rand, TAU, yawTo } from "./math.js";

function steer(entity, x, z, speed, dt) {
  const length = Math.hypot(x, z);
  const moveX = length ? (x / length) * speed : 0;
  const moveZ = length ? (z / length) * speed : 0;
  if (entity.body) {
    entity.body.velocity.x = moveX;
    entity.body.velocity.z = moveZ;
  } else {
    entity.position.x += moveX * dt;
    entity.position.z += moveZ * dt;
  }
  if (length) {
    entity.object.rotation.y = dampAngle(entity.object.rotation.y, Math.atan2(moveX, moveZ), 10, dt);
  }
}

// Returns the distance to the target. Stops moving within stopDistance.
export function chase(entity, target, dt, { speed = 3, stopDistance = 0 } = {}) {
  const position = target.position;
  const distance = distanceXZ(entity.position, position);
  if (distance > stopDistance) {
    steer(entity, position.x - entity.position.x, position.z - entity.position.z, speed, dt);
  } else {
    steer(entity, 0, 0, 0, dt);
  }
  return distance;
}

export function flee(entity, target, dt, { speed = 3 } = {}) {
  const position = target.position;
  steer(entity, entity.position.x - position.x, entity.position.z - position.z, speed, dt);
}

export function wander(entity, dt, { speed = 1.5, turnEvery = 2 } = {}) {
  entity.wanderLeft = (entity.wanderLeft ?? 0) - dt;
  if (entity.wanderLeft <= 0) {
    entity.wanderLeft = rand(turnEvery * 0.5, turnEvery * 1.5);
    entity.wanderAngle = rand(TAU);
  }
  steer(entity, Math.sin(entity.wanderAngle), Math.cos(entity.wanderAngle), speed, dt);
}

// Walks through [x, z] points and back to the first
export function patrol(entity, points, dt, { speed = 2, reach = 0.3 } = {}) {
  entity.patrolIndex ??= 0;
  const [x, z] = points[entity.patrolIndex];
  const dx = x - entity.position.x;
  const dz = z - entity.position.z;
  if (Math.hypot(dx, dz) < reach) entity.patrolIndex = (entity.patrolIndex + 1) % points.length;
  steer(entity, dx, dz, speed, dt);
}

// True when the target is in range and within the view cone, in radians either side
export function canSee(entity, target, { range = 12, cone = Math.PI / 3 } = {}) {
  if (distanceXZ(entity.position, target.position) > range) return false;
  return Math.abs(angleDelta(entity.object.rotation.y, yawTo(entity.position, target.position))) <= cone;
}

// Tiny state machine: machine({ idle: { enter, update(dt), exit } }, "idle"),
// then machine.update(dt) and machine.go("chase")
export function machine(states, initial) {
  const fsm = {
    state: null,
    time: 0, // Seconds in the current state
    go(name) {
      if (fsm.state === name) return;
      states[fsm.state]?.exit?.();
      fsm.state = name;
      fsm.time = 0;
      states[name].enter?.();
    },
    update(dt) {
      fsm.time += dt;
      states[fsm.state]?.update?.(dt);
    },
  };
  fsm.go(initial);
  return fsm;
}

class MinHeap {
  items = [];

  push(item, priority) {
    const { items } = this;
    items.push({ item, priority });
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent].priority <= items[i].priority) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }

  pop() {
    const { items } = this;
    const top = items[0];
    const last = items.pop();
    if (items.length) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if (left < items.length && items[left].priority < items[smallest].priority) smallest = left;
        if (right < items.length && items[right].priority < items[smallest].priority) smallest = right;
        if (smallest === i) break;
        [items[smallest], items[i]] = [items[i], items[smallest]];
        i = smallest;
      }
    }
    return top.item;
  }

  get size() {
    return this.items.length;
  }
}

// A* on a grid. blocked(col, row) is true for walls, for example level.isBlocked.
// from and to are { col, row }. Returns the cells after from, or [] when unreachable.
export function findPath(blocked, from, to, { maxSteps = 20000, diagonal = false } = {}) {
  const key = (col, row) => `${col},${row}`;
  const steps = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  if (diagonal) steps.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
  const estimate = (col, row) => Math.abs(col - to.col) + Math.abs(row - to.row);

  const open = new MinHeap();
  const cameFrom = new Map();
  const cost = new Map([[key(from.col, from.row), 0]]);
  open.push(from, estimate(from.col, from.row));

  for (let visited = 0; open.size && visited < maxSteps; visited++) {
    const current = open.pop();
    if (current.col === to.col && current.row === to.row) {
      const path = [];
      for (let node = current; node !== from && cameFrom.has(key(node.col, node.row)); node = cameFrom.get(key(node.col, node.row))) {
        path.unshift(node);
      }
      return path;
    }
    const currentCost = cost.get(key(current.col, current.row));
    for (const [dCol, dRow] of steps) {
      const col = current.col + dCol;
      const row = current.row + dRow;
      if (blocked(col, row)) continue;
      if (dCol && dRow && (blocked(current.col + dCol, current.row) || blocked(current.col, current.row + dRow))) continue;
      const nextCost = currentCost + (dCol && dRow ? Math.SQRT2 : 1);
      const nextKey = key(col, row);
      if (nextCost >= (cost.get(nextKey) ?? Infinity)) continue;
      cost.set(nextKey, nextCost);
      cameFrom.set(nextKey, current);
      open.push({ col, row }, nextCost + estimate(col, row));
    }
  }
  return [];
}
