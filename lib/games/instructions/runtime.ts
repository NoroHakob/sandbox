import { GAME_DIR, PREVIEW_PORT } from "@/lib/daytona/utils"

export const runtime = `The game lives in ${GAME_DIR} inside a sandbox, and the same sandbox is used for the whole conversation, so your earlier files are still there on later turns.

- ${GAME_DIR}/index.html is the entry point. A new sandbox shows a welcome page from welcome.js: point the module script in index.html at your own entry, such as game.js, and delete welcome.js.
- ${GAME_DIR}/engine/ already holds a three.js game engine. Import it instead of rewriting any of it. Read its files with read_file when you need more detail than the API below.
- Never edit or delete anything in engine/, and never change or remove the import map in index.html.
- three is loaded by that import map. Import "three" and "three/addons/..." directly, or use THREE from the engine, and never add another copy.
- A static file server is already running on port ${PREVIEW_PORT} and serves ${GAME_DIR}. Never start one.
- There is no build step and no npm. Write plain HTML, CSS and JavaScript that the browser runs as is, with no TypeScript or JSX.
- Load other libraries only from a CDN, by full URL.
- There is no backend. Use storage from the engine for anything that must persist, such as high scores.
- No asset files exist. Use the engine's procedural models, textures and sound, and build anything else in code.
- Split the code into modules as the game grows.`
