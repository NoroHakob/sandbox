// DOM overlay above the canvas. It stays out of the way of pointer input except on
// buttons and screens, and has its own styles so a game can replace style.css freely.
import * as storage from "./storage.js";

const CSS = `
:root{--hud-accent:#ea580c;--hud-text:#fff;--hud-panel:rgba(12,14,20,.62);--hud-font:ui-rounded,"SF Pro Rounded","Segoe UI",system-ui,sans-serif}
.hud{position:fixed;inset:0;z-index:10;pointer-events:none;color:var(--hud-text);font-family:var(--hud-font);-webkit-user-select:none;user-select:none;text-shadow:0 1px 3px rgba(0,0,0,.45)}
.hud *{box-sizing:border-box}
.hud-slot{position:absolute;display:flex;flex-direction:column;gap:8px;padding:16px;max-width:100%}
.hud-top-left{top:0;left:0;align-items:flex-start}
.hud-top-center{top:0;left:50%;transform:translateX(-50%);align-items:center}
.hud-top-right{top:0;right:0;align-items:flex-end}
.hud-bottom-left{bottom:0;left:0;align-items:flex-start}
.hud-bottom-center{bottom:0;left:50%;transform:translateX(-50%);align-items:center}
.hud-bottom-right{bottom:0;right:0;align-items:flex-end}
.hud-stat{display:flex;align-items:baseline;gap:8px;padding:6px 12px;border-radius:10px;background:var(--hud-panel)}
.hud-stat small{font-size:12px;letter-spacing:.06em;text-transform:uppercase;opacity:.75}
.hud-stat b{font-size:22px;font-variant-numeric:tabular-nums}
.hud-bar{width:200px;max-width:42vw}
.hud-bar small{display:block;margin-bottom:3px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;opacity:.8}
.hud-track{height:12px;border-radius:7px;overflow:hidden;background:var(--hud-panel)}
.hud-fill{height:100%;border-radius:7px;background:var(--hud-accent);transition:width .15s ease-out}
.hud-hearts{font-size:24px;letter-spacing:2px}
.hud-hearts i{font-style:normal;color:#ef4444}
.hud-hearts i.off{color:#fff;opacity:.2}
.hud-toasts{position:absolute;top:18%;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:6px;width:90%}
.hud-toast{padding:7px 14px;border-radius:10px;background:var(--hud-panel);font-weight:600;font-size:16px;animation:hud-rise .2s ease-out,hud-out .3s ease-in var(--hud-delay) forwards}
.hud-banner{position:absolute;top:34%;left:0;right:0;padding:0 16px;text-align:center;animation:hud-pop .3s cubic-bezier(.2,1.4,.5,1),hud-out .35s ease-in var(--hud-delay) forwards}
.hud-banner h2{margin:0;font-size:clamp(34px,8vw,68px);font-weight:900;letter-spacing:-.01em}
.hud-banner p{margin:6px 0 0;font-size:clamp(15px,3vw,20px);opacity:.85}
.hud-screen{position:absolute;inset:0;display:grid;place-items:center;padding:20px;pointer-events:auto;overflow:auto;animation:hud-fade .2s ease-out}
.hud-screen.passive{pointer-events:none}
.hud-screen.bottom{place-items:end center;padding-bottom:8vh}
.hud-screen.bottom .hud-card{max-width:760px;gap:6px}
.hud-screen.bottom h1{font-size:clamp(26px,5vw,42px)}
.hud-screen.dim{background:rgba(6,8,12,.55);backdrop-filter:blur(3px)}
.hud-card{display:flex;flex-direction:column;align-items:center;gap:12px;width:100%;max-width:440px;text-align:center}
.hud-card h1{margin:0;font-size:clamp(36px,9vw,64px);font-weight:900;line-height:1.02;letter-spacing:-.02em}
.hud-card .hud-sub{margin:0;font-size:18px;opacity:.88}
.hud-card .hud-body{margin:0;font-size:15px;line-height:1.5;opacity:.75;white-space:pre-line}
.hud-rows{display:grid;grid-template-columns:1fr auto;gap:4px 28px;margin:4px 0;font-size:17px;text-align:left}
.hud-rows b{text-align:right;font-variant-numeric:tabular-nums}
.hud-buttons{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin-top:8px}
.hud-button{pointer-events:auto;min-height:46px;padding:0 26px;border:0;border-radius:12px;background:rgba(255,255,255,.14);color:inherit;font:700 17px var(--hud-font);cursor:pointer;transition:transform .08s,filter .12s}
.hud-button.primary{background:var(--hud-accent)}
.hud-button:hover{filter:brightness(1.15)}
.hud-button:active{transform:scale(.96)}
.hud-button:focus-visible{outline:3px solid #fff;outline-offset:2px}
.hud-corner-button{min-width:44px;min-height:44px;padding:0 10px;background:var(--hud-panel);font-size:20px}
.hud-crosshair{position:absolute;top:50%;left:50%;width:18px;height:18px;margin:-9px;background:linear-gradient(#fff,#fff) center/2px 100% no-repeat,linear-gradient(#fff,#fff) center/100% 2px no-repeat;mix-blend-mode:difference;transition:transform .08s}
.hud-dialog{position:absolute;left:50%;bottom:24px;transform:translateX(-50%);width:min(680px,calc(100% - 32px));padding:16px 20px;border-radius:14px;background:rgba(12,14,20,.86);pointer-events:auto;cursor:pointer;font-size:17px;line-height:1.45}
.hud-dialog strong{display:block;margin-bottom:4px;color:var(--hud-accent)}
.hud-anchor{position:absolute;top:0;left:0;display:flex;flex-direction:column;align-items:center;gap:3px;font-size:13px;font-weight:700;will-change:transform}
.hud-anchor .hud-track{width:56px;height:6px}
.hud-float{position:absolute;top:0;left:0;font-weight:900;font-size:22px;will-change:transform,opacity}
.hud-flash{position:absolute;inset:0;animation:hud-out var(--hud-delay) ease-out forwards}
.hud-map{border-radius:50%;background:var(--hud-panel);border:2px solid rgba(255,255,255,.25)}
.hud-error{position:absolute;inset:auto 16px 16px;padding:12px 16px;border-radius:10px;background:#7f1d1d;color:#fff;font:13px/1.45 ui-monospace,monospace;white-space:pre-wrap;pointer-events:auto;max-height:50%;overflow:auto}
@keyframes hud-fade{from{opacity:0}}
@keyframes hud-rise{from{opacity:0;transform:translateY(8px)}}
@keyframes hud-pop{from{opacity:0;transform:scale(.8)}}
@keyframes hud-out{to{opacity:0}}
`;

const SLOTS = ["top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function createHud(game) {
  const style = el("style");
  style.textContent = CSS;
  document.head.append(style);

  const root = el("div", "hud");
  const toasts = el("div", "hud-toasts");
  const slots = {};
  for (const name of SLOTS) {
    slots[name] = el("div", `hud-slot hud-${name}`);
    root.append(slots[name]);
  }
  root.append(toasts);
  document.body.append(root);

  const widgets = new Map();
  const frameWork = new Set();
  const liveLabels = new Map();
  let openScreens = 0;
  let pauseMenuReady = false;
  let pauseOptions = {};
  let pauseScreen = null;

  game.onFrame((dt) => {
    for (const work of [...frameWork]) work(dt);
    for (const [node, label] of liveLabels) {
      if (!node.isConnected) {
        liveLabels.delete(node);
        continue;
      }
      const text = label();
      if (node.textContent !== text) node.textContent = text;
    }
  });

  // A label can be a function, which then follows its value every frame
  function setLabel(node, label) {
    if (typeof label === "function") liveLabels.set(node, label);
    else liveLabels.delete(node);
    node.textContent = typeof label === "function" ? label() : label;
  }

  function register(id, element, slot, handle) {
    widgets.get(id)?.remove();
    (slots[slot] ?? root).append(element);
    const widget = {
      el: element,
      keep: handle.keep,
      set: handle.set,
      get value() {
        return handle.read?.();
      },
      remove() {
        element.remove();
        handle.onRemove?.();
        widgets.delete(id);
      },
    };
    widgets.set(id, widget);
    return widget;
  }

  function timed(element, seconds, parent = root) {
    element.style.setProperty("--hud-delay", `${seconds}s`);
    parent.append(element);
    element.addEventListener("animationend", (event) => {
      if (event.animationName === "hud-out") element.remove();
    });
    return element;
  }

  function resumeFromPause() {
    pauseScreen?.close();
    pauseScreen = null;
    game.resume();
  }

  const hud = {
    root,

    // Text value with a label
    stat(id, { label = id, value = 0, slot = "top-left", format = String } = {}) {
      const element = el("div", "hud-stat");
      const number = el("b", "", format(value));
      element.append(el("small", "", label), number);
      let current = value;
      return register(id, element, slot, {
        read: () => current,
        set(next) {
          current = next;
          number.textContent = format(next);
        },
      });
    },

    // Filled bar. set() takes a value from 0 to max.
    bar(id, { label = "", value = 1, max = 1, slot = "top-left", color } = {}) {
      const element = el("div", "hud-bar");
      if (label) element.append(el("small", "", label));
      const track = el("div", "hud-track");
      const fill = el("div", "hud-fill");
      if (color) fill.style.background = color;
      track.append(fill);
      element.append(track);
      let current = value;
      const set = (next) => {
        current = next;
        fill.style.width = `${Math.max(0, Math.min(1, next / max)) * 100}%`;
      };
      set(value);
      return register(id, element, slot, {
        read: () => current,
        set,
      });
    },

    // Row of lives
    hearts(id = "lives", { max = 3, value = max, slot = "top-left", icon = "♥" } = {}) {
      const element = el("div", "hud-hearts");
      const icons = Array.from({ length: max }, () => el("i", "", icon));
      element.append(...icons);
      let current = value;
      const set = (next) => {
        current = next;
        icons.forEach((node, index) => node.classList.toggle("off", index >= next));
      };
      set(value);
      return register(id, element, slot, {
        read: () => current,
        set,
      });
    },

    set: (id, value) => widgets.get(id)?.set(value),
    get: (id) => widgets.get(id)?.value,
    remove: (id) => widgets.get(id)?.remove(),

    crosshair() {
      const element = el("div", "hud-crosshair");
      return register("crosshair", element, null, {});
    },

    // Small button for a corner. It stays through hud.clear(), so create it once.
    // Give an icon label a title, which is also what screen readers announce.
    button(id, { label, title, onClick, slot = "top-right" } = {}) {
      const element = el("button", "hud-button hud-corner-button");
      element.type = "button";
      if (title) {
        element.title = title;
        element.setAttribute("aria-label", title);
      }
      setLabel(element, label);
      element.addEventListener("click", () => {
        // Left focused, Space would press it again instead of reaching the game
        element.blur();
        game.sound.play("click");
        onClick?.();
      });
      return register(id, element, slot, {
        keep: true,
        read: () => element.textContent,
        set: (next) => setLabel(element, next),
      });
    },

    toast(text, { duration = 2 } = {}) {
      return timed(el("div", "hud-toast", text), duration, toasts);
    },

    // Large center text that fades, e.g. "Wave 3"
    banner(text, { sub, duration = 1.4 } = {}) {
      const element = el("div", "hud-banner");
      element.append(el("h2", "", text));
      if (sub) element.append(el("p", "", sub));
      return timed(element, duration);
    },

    // Modal. buttons: [{ label, onClick, primary }], where label can be a function.
    // rows: [[label, value]].
    // A button closes the screen first, unless keepOpen is set on it.
    // passive: true lets clicks through to the game, align: "bottom" moves it down.
    screen({ title, subtitle, text, rows, buttons = [], dim = true, passive = false, align = "center" } = {}) {
      const screen = el("div", `hud-screen${dim ? " dim" : ""}${passive ? " passive" : ""} ${align}`);
      const card = el("div", "hud-card");
      if (title) card.append(el("h1", "", title));
      if (subtitle) card.append(el("p", "hud-sub", subtitle));
      if (text) card.append(el("p", "hud-body", text));
      if (rows?.length) {
        const list = el("div", "hud-rows");
        for (const [label, value] of rows) list.append(el("span", "", label), el("b", "", value));
        card.append(list);
      }

      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        openScreens--;
        screen.remove();
      };

      if (buttons.length) {
        const row = el("div", "hud-buttons");
        buttons.forEach(({ label, onClick, primary = false, keepOpen = false }, index) => {
          const button = el("button", `hud-button${primary || index === 0 ? " primary" : ""}`);
          button.type = "button";
          setLabel(button, label);
          button.addEventListener("click", () => {
            game.sound.play("click");
            if (!keepOpen) close();
            onClick?.();
          });
          row.append(button);
        });
        card.append(row);
        // Without page focus this would pull focus away from whatever embeds the game
        if (document.hasFocus()) queueMicrotask(() => row.firstChild.focus({ preventScroll: true }));
      }

      screen.append(card);
      root.append(screen);
      openScreens++;
      return { el: screen, close };
    },

    // The first click also gives the page keyboard focus and unlocks audio, so start here
    startScreen({ title = "Ready?", subtitle, text, button = "Play", onStart, dim = true } = {}) {
      return hud.screen({ title, subtitle, text, dim, buttons: [{ label: button, onClick: onStart }] });
    },

    // Saves the high score under bestKey and shows it
    gameOverScreen({ title = "Game over", subtitle, score, bestKey = "best", rows = [], button = "Play again", onRestart, extraButtons = [] } = {}) {
      const allRows = [...rows];
      if (score !== undefined) {
        const previous = storage.best(bestKey);
        const best = storage.best(bestKey, score);
        allRows.unshift(["Score", score], [best > previous ? "New best!" : "Best", best]);
      }
      return hud.screen({
        title,
        subtitle,
        rows: allRows,
        buttons: [{ label: button, onClick: onRestart }, ...extraButtons],
      });
    },

    // Esc or P pause with a screen that has Resume and Sound. Only the key and
    // openPauseMenu() open it, so a game can call game.pause() itself, for example
    // behind its game over screen. Extra buttons leave the game paused for their
    // onClick to decide, and the menu closes unless keepOpen is set on them.
    pauseMenu({ title = "Paused", text, extraButtons = [] } = {}) {
      if (pauseMenuReady) return;
      pauseMenuReady = true;
      pauseOptions = { title, text, extraButtons };
      game.onFrame(() => {
        if (!game.input.pressed("pause")) return;
        if (pauseScreen) resumeFromPause();
        else hud.openPauseMenu();
      });
    },

    // For a pause button. Does nothing while paused or behind another screen.
    openPauseMenu() {
      if (game.paused || openScreens > 0) return;
      const { title = "Paused", text, extraButtons = [] } = pauseOptions;
      game.pause();
      pauseScreen = hud.screen({
        title,
        text,
        buttons: [
          { label: "Resume", onClick: resumeFromPause },
          {
            label: () => `Sound: ${game.sound.muted ? "Off" : "On"}`,
            keepOpen: true,
            onClick: () => game.sound.toggleMute(),
          },
          ...extraButtons.map((button) =>
            button.keepOpen
              ? button
              : {
                  ...button,
                  // Closing happens in hud.screen, so the menu has to forget it here
                  onClick: () => {
                    pauseScreen = null;
                    button.onClick?.();
                  },
                },
          ),
        ],
      });
    },

    // Text box that types itself out. Click or any action key to advance. Resolves when read.
    dialog(lines, { speaker } = {}) {
      return new Promise((resolve) => {
        const box = el("div", "hud-dialog");
        const name = speaker ? el("strong", "", speaker) : null;
        const body = el("div");
        box.append(...(name ? [name, body] : [body]));
        root.append(box);

        let index = 0;
        let shown = 0;
        const list = [lines].flat();

        const advance = () => {
          if (index >= list.length) return;
          if (shown < list[index].length) {
            shown = list[index].length;
            body.textContent = list[index];
            return;
          }
          index++;
          shown = 0;
          body.textContent = "";
          if (index >= list.length) {
            frameWork.delete(type);
            box.remove();
            resolve();
          }
        };
        const type = (dt) => {
          const { input } = game;
          if (input.pressed("action") || input.pressed("jump")) return advance();
          if (shown >= list[index].length) return;
          shown = Math.min(list[index].length, shown + dt * 45);
          body.textContent = list[index].slice(0, Math.floor(shown));
        };
        box.addEventListener("click", advance);
        frameWork.add(type);
      });
    },

    // Label or small bar that follows a world object. Offset is in world units.
    anchor(target, { text = "", bar, height = 2.2 } = {}) {
      const element = el("div", "hud-anchor");
      const label = el("span", "", text);
      element.append(label);
      const object = target.object ?? target;
      const fill = el("div", "hud-fill");
      if (bar !== undefined) {
        const track = el("div", "hud-track");
        fill.style.width = `${bar * 100}%`;
        track.append(fill);
        element.append(track);
      }
      root.append(element);
      const point = object.position.clone();
      const screen = { x: 0, y: 0, visible: false };
      const work = () => {
        if (!object.parent) return handle.remove();
        object.getWorldPosition(point);
        point.y += height;
        game.project(point, screen);
        element.style.display = screen.visible ? "" : "none";
        element.style.transform = `translate(${screen.x}px,${screen.y}px) translate(-50%,-100%)`;
      };
      const handle = {
        el: element,
        setText: (value) => (label.textContent = value),
        setBar: (value) => (fill.style.width = `${Math.max(0, Math.min(1, value)) * 100}%`),
        remove() {
          frameWork.delete(work);
          element.remove();
        },
      };
      frameWork.add(work);
      return handle;
    },

    // Radar centered on an object. layers: [{ tag, color, size }].
    minimap({ center, layers = [], range = 40, size = 150, slot = "top-right" }) {
      const canvas = el("canvas", "hud-map");
      canvas.width = canvas.height = size;
      canvas.style.width = canvas.style.height = `${size}px`;
      const context = canvas.getContext("2d");
      const middle = size / 2;
      const work = () => {
        const origin = (center.object ?? center).position;
        context.clearRect(0, 0, size, size);
        for (const { tag, color = "#fff", size: dot = 3 } of layers) {
          context.fillStyle = color;
          for (const entity of game.query(tag)) {
            const x = ((entity.position.x - origin.x) / range) * middle;
            const y = ((entity.position.z - origin.z) / range) * middle;
            if (x * x + y * y > middle * middle) continue;
            context.beginPath();
            context.arc(middle + x, middle + y, dot, 0, Math.PI * 2);
            context.fill();
          }
        }
        context.fillStyle = "#fff";
        context.fillRect(middle - 2, middle - 2, 4, 4);
      };
      frameWork.add(work);
      return register("minimap", canvas, slot, { onRemove: () => frameWork.delete(work) });
    },

    theme({ accent, text, panel, font } = {}) {
      const { style: rootStyle } = document.documentElement;
      if (accent) rootStyle.setProperty("--hud-accent", accent);
      if (text) rootStyle.setProperty("--hud-text", text);
      if (panel) rootStyle.setProperty("--hud-panel", panel);
      if (font) rootStyle.setProperty("--hud-font", font);
    },

    // Removes widgets, screens and labels, for a full restart. hud.button() stays.
    clear() {
      for (const widget of [...widgets.values()]) {
        if (!widget.keep) widget.remove();
      }
      frameWork.clear();
      toasts.replaceChildren();
      for (const node of root.querySelectorAll(".hud-screen,.hud-banner,.hud-anchor,.hud-dialog,.hud-float")) node.remove();
      openScreens = 0;
      pauseScreen = null;
    },

    error(error) {
      root.append(el("div", "hud-error", `Game crashed: ${error?.message ?? error}`));
    },
  };

  game.on("clear", () => {
    for (const node of root.querySelectorAll(".hud-float")) node.remove();
  });

  return hud;
}
