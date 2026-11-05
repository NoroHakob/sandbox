// Keyboard, mouse and touch behind named actions. Read it from onUpdate:
// pressed() and released() are true for one frame only.
import * as THREE from "three";

const DEFAULT_BINDINGS = {
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  up: ["ArrowUp", "KeyW"],
  down: ["ArrowDown", "KeyS"],
  jump: ["Space"],
  fire: ["Mouse0", "KeyJ"],
  action: ["KeyE", "Enter"],
  run: ["ShiftLeft", "ShiftRight"],
  pause: ["Escape", "KeyP"],
};

const SCROLL_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "Tab"]);
const TEXT_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function createInput(canvas, getCamera) {
  const bindings = { ...DEFAULT_BINDINGS };
  const held = new Set();
  const pressedNow = new Set();
  const releasedNow = new Set();
  const axisValue = { x: 0, y: 0 };
  const stick = { x: 0, y: 0 };
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let touchRoot = null;

  const pointer = {
    x: 0, // CSS pixels from the top left of the canvas
    y: 0,
    ndcX: 0, // -1..1, +y up
    ndcY: 0,
    dx: 0, // movement this frame, also while the pointer is locked
    dy: 0,
    wheel: 0,
    down: false,
    pressed: false,
    released: false,
    locked: false,
  };

  function press(code) {
    if (!held.has(code)) pressedNow.add(code);
    held.add(code);
  }
  function release(code) {
    if (held.delete(code)) releasedNow.add(code);
  }

  const matches = (set, name) => {
    if (set.has(`@${name}`)) return true;
    return (bindings[name] ?? [name]).some((code) => set.has(code));
  };

  addEventListener("keydown", (event) => {
    const target = event.target?.tagName;
    if (TEXT_TAGS.has(target)) return;
    // A focused button keeps the keys that click it, but Esc must still reach the game
    if (target === "BUTTON" && (event.code === "Enter" || event.code === "Space")) return;
    if (SCROLL_KEYS.has(event.code)) event.preventDefault();
    if (!event.repeat) press(event.code);
  });
  addEventListener("keyup", (event) => release(event.code));
  addEventListener("blur", () => {
    for (const code of [...held]) release(code);
    pointer.down = false;
  });

  function trackPointer(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = event.clientX - rect.left;
    pointer.y = event.clientY - rect.top;
    pointer.ndcX = (pointer.x / rect.width) * 2 - 1;
    pointer.ndcY = -(pointer.y / rect.height) * 2 + 1;
  }

  let primaryId = null;
  let lastX = 0;
  let lastY = 0;

  canvas.addEventListener("pointerdown", (event) => {
    focus();
    trackPointer(event);
    press(`Mouse${event.button}`);
    if (primaryId !== null) return;
    primaryId = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    pointer.down = true;
    pointer.pressed = true;
    canvas.setPointerCapture?.(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (document.pointerLockElement === canvas) {
      pointer.dx += event.movementX;
      pointer.dy += event.movementY;
      return;
    }
    if (primaryId !== null && event.pointerId !== primaryId) return;
    trackPointer(event);
    if (primaryId !== null) {
      pointer.dx += event.clientX - lastX;
      pointer.dy += event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
    }
  });

  function endPointer(event) {
    release(`Mouse${event.button}`);
    if (event.pointerId !== primaryId) return;
    primaryId = null;
    pointer.down = false;
    pointer.released = true;
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      pointer.wheel += Math.sign(event.deltaY);
    },
    { passive: false },
  );
  document.addEventListener("pointerlockchange", () => {
    pointer.locked = document.pointerLockElement === canvas;
  });

  function setRay() {
    raycaster.setFromCamera(ndc.set(pointer.ndcX, pointer.ndcY), getCamera());
    return raycaster;
  }

  function buildTouchControls({ joystick = true, buttons = ["jump", "fire"], force = false } = {}) {
    touchRoot?.remove();
    touchRoot = null;
    if (!force && navigator.maxTouchPoints === 0) return;

    touchRoot = document.createElement("div");
    touchRoot.style.cssText =
      "position:fixed;inset:0;pointer-events:none;z-index:20;touch-action:none;user-select:none";
    document.body.append(touchRoot);

    const circle =
      "position:absolute;border-radius:50%;background:rgba(255,255,255,.14);" +
      "border:2px solid rgba(255,255,255,.3);pointer-events:auto;touch-action:none";

    if (joystick) {
      const base = document.createElement("div");
      const knob = document.createElement("div");
      base.style.cssText = `${circle};left:24px;bottom:24px;width:120px;height:120px`;
      knob.style.cssText =
        "position:absolute;left:35px;top:35px;width:46px;height:46px;border-radius:50%;" +
        "background:rgba(255,255,255,.5);pointer-events:none";
      base.append(knob);
      touchRoot.append(base);

      const move = (event) => {
        const rect = base.getBoundingClientRect();
        const x = (event.clientX - rect.left - rect.width / 2) / (rect.width / 2);
        const y = (event.clientY - rect.top - rect.height / 2) / (rect.height / 2);
        const length = Math.max(1, Math.hypot(x, y));
        stick.x = x / length;
        stick.y = -y / length;
        knob.style.transform = `translate(${stick.x * 37}px,${-stick.y * 37}px)`;
      };
      const stop = () => {
        stick.x = stick.y = 0;
        knob.style.transform = "";
      };
      base.addEventListener("pointerdown", (event) => {
        base.setPointerCapture(event.pointerId);
        move(event);
      });
      base.addEventListener("pointermove", (event) => {
        if (base.hasPointerCapture(event.pointerId)) move(event);
      });
      base.addEventListener("pointerup", stop);
      base.addEventListener("pointercancel", stop);
    }

    buttons.forEach((name, index) => {
      const button = document.createElement("div");
      button.textContent = name;
      button.style.cssText =
        `${circle};right:${24 + index * 92}px;bottom:${36 + (index % 2) * 44}px;width:80px;height:80px;` +
        "display:grid;place-items:center;color:#fff;font:600 13px system-ui";
      button.addEventListener("pointerdown", (event) => {
        button.setPointerCapture(event.pointerId);
        press(`@${name}`);
      });
      const up = () => release(`@${name}`);
      button.addEventListener("pointerup", up);
      button.addEventListener("pointercancel", up);
      touchRoot.append(button);
    });
  }

  return {
    pointer,
    // Add or replace actions, e.g. bind({ dash: ["KeyQ"] }). Codes are KeyboardEvent.code or Mouse0-2.
    bind(actions) {
      Object.assign(bindings, actions);
    },
    // Each takes an action name or a raw code
    down: (name) => matches(held, name),
    pressed: (name) => matches(pressedNow, name),
    released: (name) => matches(releasedNow, name),
    // Movement in -1..1: x is right, y is up/forward. Merges keys and the touch stick.
    axis() {
      const x = (matches(held, "right") ? 1 : 0) - (matches(held, "left") ? 1 : 0) + stick.x;
      const y = (matches(held, "up") ? 1 : 0) - (matches(held, "down") ? 1 : 0) + stick.y;
      const length = Math.max(1, Math.hypot(x, y));
      axisValue.x = x / length;
      axisValue.y = y / length;
      return axisValue;
    },
    lockPointer() {
      canvas.requestPointerLock?.()?.catch?.(() => {});
    },
    unlockPointer() {
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    },
    // The first object under the pointer, or null. hit.object is the mesh.
    pick(objects, recursive = true) {
      const list = Array.isArray(objects) ? objects : [objects];
      return setRay().intersectObjects(list, recursive)[0] ?? null;
    },
    // Where the pointer ray crosses the horizontal plane at height y
    groundPoint(y = 0, target = new THREE.Vector3()) {
      plane.constant = -y;
      return setRay().ray.intersectPlane(plane, target);
    },
    // On-screen stick and buttons, only shown on touch devices unless force is set
    touchControls: buildTouchControls,
    endFrame() {
      pressedNow.clear();
      releasedNow.clear();
      pointer.dx = pointer.dy = pointer.wheel = 0;
      pointer.pressed = pointer.released = false;
    },
  };
}
