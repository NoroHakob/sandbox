// Lighting and sky presets.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

import * as textures from "./textures.js";

const PRESETS = {
  daylight: {
    sky: [0x4f9fe8, 0xa9d8f5, 0xe9f6ff],
    fog: 0xd5ecfa,
    hemi: [0xdff1ff, 0x7c9a6a, 1.4],
    sun: [0xfff3df, 2.6, [18, 30, 12]],
  },
  sunset: {
    sky: [0x3b2a6e, 0xd8567a, 0xffb35c],
    fog: 0xeb8f6d,
    hemi: [0xffc6a3, 0x4d3560, 1.1],
    sun: [0xffa55a, 3, [-24, 12, 14]],
  },
  night: {
    sky: [0x050816, 0x0c1633, 0x1c2c56],
    fog: 0x0f1a36,
    hemi: [0x6d84c7, 0x10162c, 0.6],
    sun: [0xaec6ff, 0.9, [-12, 26, -10]],
  },
  studio: {
    sky: null,
    fog: null,
    hemi: [0xffffff, 0x8a8f99, 1.6],
    sun: [0xffffff, 2.2, [6, 12, 8]],
  },
  dungeon: {
    sky: null,
    fog: 0x0b0a0f,
    hemi: [0x5a5266, 0x14101a, 0.5],
    sun: [0xffb46b, 0.8, [6, 20, 4]],
  },
  neon: {
    sky: [0x09021f, 0x1b0b45, 0x571a7a],
    fog: 0x1b0b45,
    hemi: [0x6a5cff, 0xff3fa4, 0.9],
    sun: [0xff5fd2, 1.2, [10, 20, -6]],
  },
};

// Gradient sky, horizon in the middle of the list or last. Colors go top to bottom.
export function sky(game, stops) {
  const texture = textures.gradient(stops).clone();
  texture.repeat.set(1, 1);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.needsUpdate = true;
  game.scene.background = texture;
  return texture;
}

// area is the width in world units that gets shadows. Keep it tight for sharper shadows.
export function sun(game, { color = 0xffffff, intensity = 2.5, position = [10, 20, 10], area = 40, mapSize = 2048 } = {}) {
  const light = new THREE.DirectionalLight(color, intensity);
  light.position.set(...position);
  light.castShadow = true;
  light.shadow.mapSize.set(mapSize, mapSize);
  const half = area / 2;
  Object.assign(light.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 0.5, far: 200 });
  light.shadow.bias = -0.0004;
  light.shadow.normalBias = 0.03;
  game.scene.add(light, light.target);
  return light;
}

// Keeps the shadow area around a moving object in large levels
export function followShadow(game, light, target) {
  const offset = light.position.clone().sub(light.target.position);
  return game.task(() => {
    const object = target.object ?? target;
    light.target.position.copy(object.position);
    light.position.copy(object.position).add(offset);
  });
}

export function point(color = 0xffffff, intensity = 30, distance = 20) {
  const light = new THREE.PointLight(color, intensity, distance);
  return light;
}

// Soft reflections, which metal needs to look like metal
export function environment(game, intensity = 0.5) {
  const generator = new THREE.PMREMGenerator(game.renderer);
  game.scene.environment = generator.fromScene(new RoomEnvironment(), 0.04).texture;
  game.scene.environmentIntensity = intensity;
  generator.dispose();
}

// Replaces any earlier preset. Options: area, sky, fog (false, or [near, far]), env.
export function preset(game, name = "daylight", { area = 40, fog = [50, 180], env = false, sky: useSky = true } = {}) {
  const settings = PRESETS[name];
  if (!settings) throw new Error(`Unknown light preset "${name}": ${Object.keys(PRESETS)}`);

  game.lights?.group.removeFromParent();
  game.lights?.sun.target.removeFromParent();

  if (settings.sky && useSky) sky(game, settings.sky);
  else if (settings.fog && useSky) game.scene.background = new THREE.Color(settings.fog);
  game.scene.fog = fog && settings.fog ? new THREE.Fog(settings.fog, fog[0], fog[1]) : null;

  const hemi = new THREE.HemisphereLight(...settings.hemi);
  const [color, intensity, position] = settings.sun;
  const mainLight = sun(game, { color, intensity, position, area });
  const group = new THREE.Group();
  group.add(hemi, mainLight);
  game.scene.add(group);
  if (env) environment(game, env === true ? 0.5 : env);

  game.lights = { group, hemi, sun: mainLight };
  return game.lights;
}
