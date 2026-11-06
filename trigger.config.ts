import { sentryEsbuildPlugin } from "@sentry/esbuild-plugin";
import { esbuildPlugin } from "@trigger.dev/build/extensions";
import { additionalFiles } from "@trigger.dev/build/extensions/core";
import { defineConfig } from "@trigger.dev/sdk";
import { config } from "dotenv";

// `trigger deploy` evaluates this file before it loads .env.local, so the
// process.env.SENTRY_* reads below would be undefined without this.
config({ path: ".env.local", quiet: true });

export default defineConfig({
  project: "proj_niuzmpssbqjumgeoixsl",
  runtime: "node-24",
  logLevel: "log",
  // The max compute seconds a task is allowed to run. If the task run exceeds this duration, it will be stopped.
  // You can override this on an individual task.
  // See https://trigger.dev/docs/runs/max-duration
  maxDuration: 3600,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  dirs: ["trigger"],
  build: {
    // Seeded into each new sandbox and never imported, so bundling would miss them
    extensions: [
      additionalFiles({ files: ["lib/games/runtime/**/*"] }),
      esbuildPlugin(
        sentryEsbuildPlugin({
          org: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
          authToken: process.env.SENTRY_AUTH_TOKEN,
        }),
        { placement: "last", target: "deploy" },
      ),
    ],
  },
});
