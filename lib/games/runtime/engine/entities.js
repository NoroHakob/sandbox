// Game objects with a tag, a velocity, a lifetime and sphere overlap tests.
import * as THREE from "three";

class Entity {
  constructor(game, object, options) {
    const { tag, tags, velocity, radius = 0.5, life = Infinity, update, onKill, body, ...fields } = options;
    this.game = game;
    this.object = object;
    this.tags = tags ?? (tag ? [tag] : []);
    this.velocity = new THREE.Vector3();
    if (velocity) this.velocity.set(velocity[0] ?? velocity.x, velocity[1] ?? velocity.y, velocity[2] ?? velocity.z);
    this.radius = radius;
    this.life = life; // Seconds until an automatic kill
    this.updateFn = update ?? null;
    this.onKill = onKill ?? null;
    this.alive = true;
    this.body = body ? game.physics.addBody(object, body) : null;
    if (this.body) this.body.velocity.copy(this.velocity);
    Object.assign(this, fields); // Anything else, e.g. hp: 3, ends up on the entity
  }

  get position() {
    return this.object.position;
  }

  kill() {
    if (!this.alive) return;
    this.alive = false;
    this.onKill?.(this);
  }
}

export function createEntities(game) {
  let entities = [];
  const rules = new Map();
  const center = new THREE.Vector3();

  const overlapping = (a, b) => {
    const reach = a.radius + b.radius;
    return a.position.distanceToSquared(b.position) <= reach * reach;
  };

  return {
    spawn(object, options = {}) {
      const entity = new Entity(game, object, options);
      if (!object.parent) game.add(object);
      entities.push(entity);
      return entity;
    },

    query(tag) {
      return entities.filter((entity) => entity.alive && (!tag || entity.tags.includes(tag)));
    },

    // The closest living entity with this tag, or null
    nearest(position, tag) {
      let closest = null;
      let closestDistance = Infinity;
      for (const entity of entities) {
        if (!entity.alive || !entity.tags.includes(tag)) continue;
        const distance = entity.position.distanceToSquared(center.copy(position));
        if (distance < closestDistance) {
          closest = entity;
          closestDistance = distance;
        }
      }
      return closest;
    },

    // One rule per tag pair: registering a pair again replaces it, so setup code can rerun
    collide(tagA, tagB, callback) {
      rules.set(`${tagA}|${tagB}`, { tagA, tagB, callback });
    },

    update(dt) {
      for (const entity of entities) {
        if (!entity.alive) continue;
        if (!entity.body) entity.object.position.addScaledVector(entity.velocity, dt);
        entity.life -= dt;
        if (entity.life <= 0) {
          entity.kill();
          continue;
        }
        entity.updateFn?.(entity, dt);
      }

      for (const { tagA, tagB, callback } of rules.values()) {
        for (const a of entities) {
          if (!a.alive || !a.tags.includes(tagA)) continue;
          for (const b of entities) {
            if (a === b || !b.alive || !b.tags.includes(tagB)) continue;
            if (overlapping(a, b)) callback(a, b);
            if (!a.alive) break;
          }
        }
      }

      if (entities.some((entity) => !entity.alive)) {
        const living = [];
        for (const entity of entities) {
          if (entity.alive) {
            living.push(entity);
            continue;
          }
          if (entity.body) game.physics.removeBody(entity.body);
          if (!entity.keepObject) game.remove(entity.object);
        }
        entities = living;
      }
    },

    clear() {
      for (const entity of entities) entity.alive = false;
      entities = [];
    },
  };
}
