export const engine = `Engine API. Import from "./engine/index.js" (path relative to index.html):
import { createGame, THREE, models, materials, textures, lights, effects, anim, controls, ai, levels, math, storage } from "./engine/index.js"

Conventions: Y is up, models face +Z with their origin at the base. Colors are hex numbers. Helpers that run over time take game first and return { stop() } or a state object. Read input only in update functions.

Skeleton:
const game = createGame({ lights: "daylight", bloom: true })
const { hud, input, sound } = game
hud.pauseMenu()
input.touchControls()
game.collide("player", "coin", (player, coin) => { sound.play("coin"); coin.kill() })
function startLevel() {
  game.clear()
  hud.clear()
  game.add(models.ground())
  const player = game.spawn(models.humanoid(), { tag: "player", radius: 0.6, body: { size: [0.8, 1.8, 0.8] } })
  const rig = anim.rig(game, player.object)
  controls.character(game, player, { rig, onJump: () => sound.play("jump") })
  controls.follow(game, player)
  hud.stat("score", { label: "Score" })
  sound.music("arcade")
}
hud.startScreen({ title: "My Game", text: "WASD to move, Space to jump", onStart: startLevel })

Always open with hud.startScreen: its click gives the page keyboard focus and unlocks audio. Keep hud.pauseMenu() and input.touchControls() so the game pauses and works on phones.
Game over: game.pause(), then hud.gameOverScreen({ score, onRestart: () => { game.resume(); startLevel() } }).

createGame({ lights: preset name or false, camera: { type: "perspective"|"orthographic", fov, size, position, lookAt }, shadows, bloom: true|{ strength, radius, threshold }, vignette: true|number, gravity: -30, background, exposure, maxPixelRatio })
game fields: scene, camera, renderer, canvas, world, physics, input, hud, sound, time, dt, timeScale, paused, stateName, lights
Loop: game.onUpdate((dt, time) => ...) | game.onFrame((realDt) => ...) also while paused | game.task(dt => ...) until it returns false | game.after(s, fn) | game.every(s, fn) | await game.wait(s)
Scene: game.add(...objects) | game.remove(objectOrEntity) | game.clear() resets the level | game.setCamera(cam) | game.project(vec3) gives { x, y, visible } in px
game.clear() removes objects, entities, colliders, task/after/every, tweens, rigs, controls, particles. It keeps onUpdate, onFrame, collide rules, states, lights, the sky and the hud. Register onUpdate and collide once at the top, and rebuild the level in a function that starts with game.clear().
States: game.state("play", { enter(data), update(dt), exit() }); game.go("play", data)
Events: game.on(name, fn), game.emit(name, ...args). Built in: pause, resume, clear, resize. game.pause(), game.resume(), game.togglePause()
Juice: game.shake(strength, seconds) | game.hitstop(seconds) | game.timeScale

Entities: const e = game.spawn(object, { tag, tags, radius, velocity: [x, y, z], life: seconds, update(e, dt), onKill(e), body: { size: [w, h, d], gravity, bounce, drag, onHit }, ...anyField })
e.object, e.position, e.velocity, e.alive, e.kill(), e.hp and other fields you passed, e.body
game.query(tag) | game.nearest(position, tag)
game.collide("bullet", "enemy", (bullet, enemy) => ...) sphere overlap by radius, one rule per tag pair

Physics: bodies are kinematic boxes, object.position is the feet. body.velocity, body.grounded.
game.physics.ground = height, (x, z) => height, or null for bottomless pits. Default 0.
game.physics.addStatic(mesh) solid from its bounds | addStatic(mesh, { moving: true }) for platforms, which carry riders | addStatic(null, { box: new THREE.Box3(min, max) }) | removeStatic(c) | overlaps(box3)

Input: input.down(name), input.pressed(name), input.released(name) for actions left right up down jump fire action run pause, or a key code like "KeyQ". input.bind({ dash: ["KeyQ"] })
input.axis() gives { x, y } in -1..1 | input.pointer { x, y, ndcX, ndcY, dx, dy, wheel, down, pressed, released, locked }
input.pick(objects) first raycast hit or null | input.groundPoint(y) pointer on a horizontal plane | input.lockPointer() | input.touchControls({ joystick, buttons: ["jump", "fire"] })

controls:
character(game, target, { speed, jump, jumps, acceleration, airControl, camera: null for world directions, axis: "x" for side-scrollers, rig, onJump, onLand }) returns { enabled, moving, grounded }
firstPerson(game, target, { speed, jump, height, sensitivity }) click captures the mouse, returns { yaw, pitch }. Spawn target as new THREE.Group() with a body. hud.crosshair() fits it.
vehicle(game, target, { acceleration, maxSpeed, turnRate, drag }) returns { speed, heading, enabled }, for car, truck, boat
follow(game, target, { offset, lookOffset, smooth, rotate, lookAhead }) | rotate: true stays behind the target
orbit(game, target, { distance, yaw, pitch, autoRotate, lock: true for third person, height })
Target is an entity, a body or an Object3D. All camera rigs write game.camera, so use one.

models.*: each takes one options object. The main color option is tint unless listed:
tree({ kind: round|pine|palm|dead, height, leaves }) rock({ size }) bush flower mushroom cloud mountain({ height, radius })
crate({ size }) barrel chest fence({ length }) lampPost trafficCone flag sign
coin gem heart star key potion bomb sword blaster shield bullet({ tint, length }) missile asteroid({ size })
house({ wall, roof, width, depth, height }) tower({ height, radius }) portal({ radius, tint }) platform({ width, depth, height, top, side }) top surface at y 0
humanoid({ skin, shirt, pants, shoes, hair, hat }) robot({ tint, accent }) quadruped({ tint, size, ears }) slime({ tint, size }) ghost bird
car({ tint }) truck boat spaceship({ kind: fighter|shuttle, tint, accent }) ufo plane
ground({ size, tint, material }) water({ size, level, tint }) terrain({ size, segments, height, scale, seed, bands }) with terrain.heightAt(x, z) text("str", { height, color })
models.instanced(model, count, (dummy, i) => dummy.position.set(...)) | models.scatter(model, { count, area, seed, heightAt, scale: [min, max], keepOut: (x, z) => bool }). Use these for more than 20 copies. Not for rigged models.
Compose: group several models in a THREE.Group, or recolor with options. Build custom shapes with THREE and materials.lowPoly(color).

materials.*: standard lowPoly toon metal glass unlit (color, options) | glow(color, intensity) feeds bloom | textured(kind, { repeat }, materialOptions) | water(color) lava() energy(color) animate themselves. They are shared, so clone() one before changing it.
textures.*: checker grid stripes noise grass sand stone lava brick planks plates ({ repeat, ...colors }) gradient([top, bottom]) label(text)
lights: preset(game, "daylight"|"sunset"|"night"|"studio"|"dungeon"|"neon", { area, fog: [near, far]|false, env: true, sky }) | sky(game, [top, mid, bottom]) | sun(game, { color, intensity, position, area }) | point(color, intensity, distance) add it yourself | environment(game, intensity) makes metal reflect | followShadow(game, game.lights.sun, target) for levels wider than area

anim: tween(game, target, { y: 2, color: 0xff0000 }, { duration, ease, delay, repeat, yoyo, onUpdate, onComplete }) is awaitable; nest vectors with { position: [x, y, z] }
easings: linear inQuad outQuad inOutQuad inCubic outCubic inOutCubic inOutSine inBack outBack outElastic outBounce
spin(game, obj, speed, axis) bob(game, obj, { height, speed }) pulse(game, obj, { amount, speed }) pop(game, obj) squash(game, obj) vanish(game, obj) flash(game, obj, { color, duration }) path(game, obj, [[x, y, z], ...], { duration, loop: "pingpong"|"repeat"|false, face })
rig(game, model) for humanoid, robot, quadruped: rig.play("idle"|"walk"|"run"|"jump"|"fall"|"wave"|"dance"|"die"), and one-shots "attack", "hit"; rig.speed. controls.character drives it when you pass rig.

effects (pos is a Vector3, [x, y, z], Object3D or entity):
burst(game, pos, { count, color, colorEnd, speed, size, sizeEnd, life, gravity, drag, spread, direction, radius, glow, soft, alpha })
explosion(game, pos, { scale, color, shake }) sparkle hit dust confetti shockwave(game, pos, { radius, color })
Continuous, return { stop() }: fire(game, source, { scale }) smoke trail emitter(game, source, { rate, ...burst })
floatText(game, pos, "+10", { color, size }) | screenFlash(game, { color, duration }) | weather(game, { type: "snow"|"rain" }) | stars(game)

hud: stat(id, { label, value, slot, format }) bar(id, { label, value, max, slot, color }) hearts(id, { max, value, slot }) each returns { set(value), remove() }. hud.set(id, value), hud.get(id), hud.remove(id)
slots: top-left top-center top-right bottom-left bottom-center bottom-right
toast(text) banner(text, { sub, duration }) crosshair() minimap({ center, layers: [{ tag, color }], range }) anchor(target, { text, bar: 0..1, height }) returns { setText, setBar, remove }
await dialog(["line", ...], { speaker })
screen({ title, subtitle, text, rows: [[label, value]], buttons: [{ label, onClick }], dim, passive, align }) returns { close() }
startScreen({ title, subtitle, text, button, onStart }) gameOverScreen({ title, score, bestKey, rows, button, onRestart }) saves the best score. pauseMenu() once for Esc/P. theme({ accent, text, panel, font }) clear()

sound: play(name, { pitch }): click select jump land step coin pickup powerup shoot laser hit hurt explosion dash bounce win lose
music(style, { seed, bpm }): arcade adventure calm tense action space | stopMusic() | drone({ wave, frequency, volume }) returns { set(hz, volume), stop() } | tone({ wave, from, to, duration, volume }) noise({ duration, from, to, volume }) | setVolume setMusicVolume toggleMute

ai (call each frame in update, moves the entity): chase(e, target, dt, { speed, stopDistance }) flee(e, target, dt) wander(e, dt) patrol(e, [[x, z], ...], dt) | canSee(e, target, { range, cone }) | machine(states, initial) with .go(name) .update(dt) .state .time | findPath(blocked, from, to, { diagonal }) cells are { col, row }
levels: fromGrid(rows, { "#": (x, z, cell) => ... }, { cell, solid }) returns { toWorld(col, row), toCell(x, z), find(char), at, isBlocked, worldWidth, worldDepth } | maze(cols, rows, seed) rows for fromGrid
math: clamp lerp invLerp remap smoothstep wrap deg moveToward damp(value, target, lambda, dt) dampAngle dampVec3 wrapAngle angleDelta vec3 distanceXZ yawTo rand(min, max) randInt pick chance shuffle randomInCircle randomOnSphere createRng(seed) noise2D fbm TAU
storage: get(key, fallback) set(key, value) remove(key) best(key, value, { lowerIsBetter }) returns the record`
