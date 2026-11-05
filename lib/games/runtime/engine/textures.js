// Textures painted in code. They tile, and each kind and options pair is built once.
import * as THREE from "three";

import { clamp, createRng, fbm } from "./math.js";

const cache = new Map();

function css(color) {
  return `#${new THREE.Color(color).getHexString()}`;
}

function channels(color) {
  const hex = new THREE.Color(color).getHex();
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

function canvasOf(size, height = size) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = height;
  return canvas;
}

function finish(canvas, { repeat = 1, pixelated = false, data = false } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  const [x, y] = [repeat].flat();
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(x, y ?? x);
  texture.colorSpace = data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  if (pixelated) {
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
  }
  texture.userData.shared = true;
  return texture;
}

function cached(name, options, build) {
  const key = name + JSON.stringify(options);
  if (!cache.has(key)) cache.set(key, finish(build(), options));
  return cache.get(key);
}

function painted(name, options, size, draw) {
  return cached(name, options, () => {
    const canvas = canvasOf(size);
    draw(canvas.getContext("2d"), size);
    return canvas;
  });
}

// shade(u, v) returns 0..1 and picks a color between dark and light
function field(name, options, size, dark, light, shade) {
  return cached(name, options, () => {
    const canvas = canvasOf(size);
    const context = canvas.getContext("2d");
    const image = context.createImageData(size, size);
    const from = channels(dark);
    const to = channels(light);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const t = clamp(shade(x / size, y / size));
        const offset = (y * size + x) * 4;
        for (let i = 0; i < 3; i++) image.data[offset + i] = from[i] + (to[i] - from[i]) * t;
        image.data[offset + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
    return canvas;
  });
}

export function checker(options = {}) {
  const { a = 0xe5e7eb, b = 0x9ca3af, cells = 8 } = options;
  return painted("checker", { a, b, cells, pixelated: true, ...options }, cells * 8, (context, size) => {
    const step = size / cells;
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        context.fillStyle = css((x + y) % 2 ? a : b);
        context.fillRect(x * step, y * step, step, step);
      }
    }
  });
}

export function grid(options = {}) {
  const { color = 0x1f2937, line = 0x4b5563, cells = 8, width = 2 } = options;
  return painted("grid", { color, line, cells, width, ...options }, 256, (context, size) => {
    context.fillStyle = css(color);
    context.fillRect(0, 0, size, size);
    context.fillStyle = css(line);
    const step = size / cells;
    for (let i = 0; i < cells; i++) {
      context.fillRect(i * step, 0, width, size);
      context.fillRect(0, i * step, size, width);
    }
  });
}

export function stripes(options = {}) {
  const { a = 0xfacc15, b = 0x171717, count = 6 } = options;
  return painted("stripes", { a, b, count, ...options }, 128, (context, size) => {
    const step = size / count;
    for (let i = 0; i < count; i++) {
      context.fillStyle = css(i % 2 ? a : b);
      context.fillRect(0, i * step, size, step);
    }
  });
}

export function noise(options = {}) {
  const { dark = 0x444444, light = 0xcccccc, scale = 8, seed = 1 } = options;
  return field("noise", { dark, light, scale, seed, ...options }, 256, dark, light, (u, v) =>
    fbm(u * scale, v * scale, { seed, period: scale }),
  );
}

export function grass(options = {}) {
  const { dark = 0x3f8f3a, light = 0x74c455 } = options;
  return field("grass", { dark, light, ...options }, 256, dark, light, (u, v) =>
    fbm(u * 16, v * 16, { seed: 3, period: 16, octaves: 5 }) * 1.5 - 0.25,
  );
}

export function sand(options = {}) {
  const { dark = 0xc9a66b, light = 0xeed9a4 } = options;
  return field("sand", { dark, light, ...options }, 256, dark, light, (u, v) =>
    fbm(u * 32, v * 8, { seed: 5, period: 8, octaves: 3 }) * 1.3 - 0.15,
  );
}

export function stone(options = {}) {
  const { dark = 0x57534e, light = 0xa8a29e } = options;
  return field("stone", { dark, light, ...options }, 256, dark, light, (u, v) =>
    fbm(u * 8, v * 8, { seed: 9, period: 8, octaves: 6 }) * 1.8 - 0.4,
  );
}

export function lava(options = {}) {
  const { dark = 0x7f1d1d, light = 0xfdba74 } = options;
  return field("lava", { dark, light, ...options }, 256, dark, light, (u, v) => {
    const warp = fbm(u * 4, v * 4, { seed: 2, period: 4 });
    return Math.abs(fbm(u * 6 + warp, v * 6, { seed: 7, period: 6 }) * 2 - 1) ** 0.6 * -1.6 + 1.2;
  });
}

// Grey height map for materials.water
export function ripples(options = {}) {
  const textureOptions = { data: true, ...options };
  return field("ripples", textureOptions, 256, 0x000000, 0xffffff, (u, v) =>
    fbm(u * 8, v * 8, { seed: 11, period: 8, octaves: 4 }),
  );
}

export function brick(options = {}) {
  const { color = 0xa8492f, mortar = 0xcfc6b8 } = options;
  return painted("brick", { color, mortar, ...options }, 256, (context, size) => {
    const rng = createRng(4);
    const rows = 8;
    const columns = 4;
    const height = size / rows;
    const width = size / columns;
    const base = new THREE.Color(color);
    context.fillStyle = css(mortar);
    context.fillRect(0, 0, size, size);
    for (let row = 0; row < rows; row++) {
      const shift = row % 2 ? width / 2 : 0;
      for (let column = -1; column < columns; column++) {
        context.fillStyle = css(base.clone().offsetHSL(0, 0, rng.range(-0.05, 0.05)));
        context.fillRect(column * width + shift + 2, row * height + 2, width - 4, height - 4);
      }
    }
  });
}

export function planks(options = {}) {
  const { color = 0x9a6b3f, gap = 0x4a2f18, count = 4 } = options;
  return painted("planks", { color, gap, count, ...options }, 256, (context, size) => {
    const rng = createRng(6);
    const base = new THREE.Color(color);
    const step = size / count;
    for (let i = 0; i < count; i++) {
      context.fillStyle = css(base.clone().offsetHSL(0, 0, rng.range(-0.04, 0.04)));
      context.fillRect(0, i * step, size, step);
      context.strokeStyle = css(base.clone().offsetHSL(0, 0, -0.08));
      for (let line = 0; line < 8; line++) {
        const y = i * step + rng.range(4, step - 4);
        context.beginPath();
        context.moveTo(0, y);
        context.bezierCurveTo(size / 3, y + rng.range(-3, 3), size / 1.5, y + rng.range(-3, 3), size, y);
        context.stroke();
      }
      context.fillStyle = css(gap);
      context.fillRect(0, i * step, size, 3);
    }
  });
}

export function plates(options = {}) {
  const { color = 0x6b7280, cells = 2 } = options;
  return painted("plates", { color, cells, ...options }, 256, (context, size) => {
    const base = new THREE.Color(color);
    const step = size / cells;
    context.fillStyle = css(base);
    context.fillRect(0, 0, size, size);
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        context.strokeStyle = css(base.clone().offsetHSL(0, 0, -0.18));
        context.lineWidth = 3;
        context.strokeRect(x * step + 3, y * step + 3, step - 6, step - 6);
        context.fillStyle = css(base.clone().offsetHSL(0, 0, -0.25));
        for (const [cornerX, cornerY] of [[12, 12], [step - 12, 12], [12, step - 12], [step - 12, step - 12]]) {
          context.beginPath();
          context.arc(x * step + cornerX, y * step + cornerY, 3, 0, Math.PI * 2);
          context.fill();
        }
      }
    }
  });
}

// Vertical gradient, top color first
export function gradient(stops, options = {}) {
  return cached("gradient", { stops, ...options }, () => {
    const canvas = canvasOf(4, 256);
    const context = canvas.getContext("2d");
    const fill = context.createLinearGradient(0, 0, 0, 256);
    stops.forEach((color, index) => fill.addColorStop(index / (stops.length - 1), css(color)));
    context.fillStyle = fill;
    context.fillRect(0, 0, 4, 256);
    return canvas;
  });
}

// Text on a canvas, for signs and sprites. Not cached, so call it once per label.
export function label(text, { color = "#ffffff", background = null, font = "700 64px system-ui, sans-serif", padding = 24 } = {}) {
  const measure = canvasOf(1).getContext("2d");
  measure.font = font;
  const width = Math.ceil(measure.measureText(text).width) + padding * 2;
  const canvas = canvasOf(width, 96 + padding);
  const context = canvas.getContext("2d");
  if (background) {
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.font = font;
  context.fillStyle = color;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = finish(canvas);
  texture.userData.shared = false;
  texture.userData.aspect = canvas.width / canvas.height;
  return texture;
}
