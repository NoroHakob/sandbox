import { GAME_DIR, PREVIEW_PORT } from "@/lib/daytona/utils"

export const runtime = `The game lives in ${GAME_DIR} inside a sandbox, and the same sandbox is used for the whole conversation, so your earlier files are still there on later turns.

- ${GAME_DIR}/index.html is the entry point.
- A static file server is already running on port ${PREVIEW_PORT} and serves ${GAME_DIR}. Never start one.
- There is no build step and no npm. Write plain HTML, CSS and JavaScript that the browser runs as is, with no TypeScript or JSX.
- Load libraries only from a CDN, by full URL.
- There is no backend. Use localStorage for anything that must persist, such as high scores.
- No asset files exist. Draw everything in code, and use the Web Audio API for sound.
- Split the code into modules as the game grows.`
