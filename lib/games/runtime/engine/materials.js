// Material presets. Same arguments give the same shared material, so spawning many
// objects stays cheap. Clone one before changing it for a single object.
import * as THREE from "three";

import * as textures from "./textures.js";

const cache = new Map();
const scrolling = new Set();
const uniformsWithTime = new Set();

function shared(key, make) {
  if (!cache.has(key)) {
    const material = make();
    material.userData.shared = true;
    cache.set(key, material);
  }
  return cache.get(key);
}

const keyOf = (...parts) => JSON.stringify(parts);

export const standard = (color = 0xffffff, options = {}) =>
  shared(keyOf("standard", color, options), () =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, ...options }),
  );

// Faceted look that suits every procedural model
export const lowPoly = (color = 0xffffff, options = {}) => standard(color, { flatShading: true, roughness: 0.85, ...options });

// The material all models paint with: vertex colors, faceted
export const painted = () =>
  shared("painted", () => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.75 }));

export const metal = (color = 0xb8c0cc, options = {}) => standard(color, { metalness: 0.9, roughness: 0.3, ...options });

export const glass = (color = 0x9fd8ff, options = {}) =>
  standard(color, { transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.1, depthWrite: false, ...options });

export const unlit = (color = 0xffffff, options = {}) =>
  shared(keyOf("unlit", color, options), () => new THREE.MeshBasicMaterial({ color, ...options }));

// Ignores lights and goes above 1, which is what createGame({ bloom }) picks up
export const glow = (color = 0xffffff, intensity = 3) =>
  shared(keyOf("glow", color, intensity), () => {
    const material = new THREE.MeshBasicMaterial({ color });
    material.color.multiplyScalar(intensity);
    return material;
  });

const toonRamps = new Map();

function toonRamp(steps) {
  if (!toonRamps.has(steps)) {
    const data = new Uint8Array(steps);
    for (let i = 0; i < steps; i++) data[i] = 80 + (175 * i) / Math.max(1, steps - 1);
    const ramp = new THREE.DataTexture(data, steps, 1, THREE.RedFormat);
    ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
    ramp.needsUpdate = true;
    ramp.userData.shared = true;
    toonRamps.set(steps, ramp);
  }
  return toonRamps.get(steps);
}

export const toon = (color = 0xffffff, { steps = 3, ...options } = {}) =>
  shared(keyOf("toon", color, steps, options), () =>
    new THREE.MeshToonMaterial({ color, gradientMap: toonRamp(steps), ...options }),
  );

// textured("brick", { repeat: 4 }). Options are passed to the texture; material options go in third.
export function textured(kind, textureOptions = {}, materialOptions = {}) {
  const map = textures[kind](textureOptions);
  return shared(keyOf("textured", kind, textureOptions, materialOptions), () =>
    new THREE.MeshStandardMaterial({ map, roughness: 0.85, ...materialOptions }),
  );
}

// Scrolls on its own while the game runs
export function water(color = 0x2a8fbd, { repeat = 8, opacity = 0.82, speed = 0.03 } = {}) {
  return shared(keyOf("water", color, repeat, opacity, speed), () => {
    const bump = textures.ripples({ repeat }).clone();
    bump.userData.shared = true;
    scrolling.add({ texture: bump, x: speed, y: speed * 0.6 });
    return new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity,
      roughness: 0.2,
      metalness: 0.1,
      bumpMap: bump,
      bumpScale: 1.5,
    });
  });
}

// Glowing floor that scrolls on its own
export function lava({ repeat = 4, intensity = 2, speed = 0.02 } = {}) {
  return shared(keyOf("lavaFloor", repeat, intensity, speed), () => {
    const map = textures.lava({ repeat }).clone();
    map.userData.shared = true;
    scrolling.add({ texture: map, x: speed, y: speed * 0.4 });
    return new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: 0xffffff,
      emissiveMap: map,
      emissiveIntensity: intensity,
    });
  });
}

// See-through rim glow for shields, ghosts and portals
export function energy(color = 0x38bdf8, { intensity = 2, power = 2.5 } = {}) {
  return shared(keyOf("energy", color, intensity, power), () => {
    const uniforms = {
      uColor: { value: new THREE.Color(color).multiplyScalar(intensity) },
      uPower: { value: power },
      uTime: { value: 0 },
    };
    uniformsWithTime.add(uniforms);
    return new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vView;
        varying float vHeight;
        void main() {
          vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vView = normalize(-viewPosition.xyz);
          vHeight = position.y;
          gl_Position = projectionMatrix * viewPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uPower;
        uniform float uTime;
        varying vec3 vNormal;
        varying vec3 vView;
        varying float vHeight;
        void main() {
          float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), uPower);
          float bands = 0.85 + 0.15 * sin(vHeight * 24.0 - uTime * 4.0);
          gl_FragColor = vec4(uColor * (rim * bands + 0.06), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
  });
}

// Called by the game loop
export function tick(dt) {
  for (const { texture, x, y } of scrolling) {
    texture.offset.x += x * dt;
    texture.offset.y += y * dt;
  }
  for (const uniforms of uniformsWithTime) uniforms.uTime.value += dt;
}
