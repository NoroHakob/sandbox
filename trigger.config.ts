import { readFileSync } from "node:fs";
import { join } from "node:path";

import { sentryEsbuildPlugin } from "@sentry/esbuild-plugin";
import {
  esbuildPlugin,
  type BuildExtension,
} from "@trigger.dev/build/extensions";
import { additionalFiles } from "@trigger.dev/build/extensions/core";
import { defineConfig } from "@trigger.dev/sdk";
import { config } from "dotenv";

const DAYTONA_SDK = "@daytona/sdk";

// @daytona/sdk loads form-data, tar and fast-glob through a require held in a
// variable, so esbuild never bundles them and a deployed worker, which has no
// node_modules, fails on file uploads. build.external can't fix it: the CLI
// takes the name from the nearest package.json, @daytona/sdk/cjs/package.json,
// which has none, and drops the external. So the plugin marks it external and
// the layer installs the sdk with its dependencies. Deploy only: trigger dev
// runs against the local node_modules
function daytonaSdk(): BuildExtension {
  return {
    name: "daytona-sdk",
    installedPackagesForTarget: (target) =>
      target === "deploy" ? [DAYTONA_SDK] : [],
    onBuildStart(context) {
      if (context.target !== "deploy") return;

      context.registerPlugin(
        {
          name: "daytona-sdk-external",
          setup(build) {
            build.onResolve({ filter: /^@daytona\/sdk(\/.*)?$/ }, (args) => ({
              path: args.path,
              external: true,
            }));
          },
        },
        { placement: "first", target: "deploy" },
      );
    },
    onBuildComplete(context) {
      if (context.target !== "deploy") return;

      // The installed version, so the worker runs what was typechecked
      const { version } = JSON.parse(
        readFileSync(
          join(context.workingDir, "node_modules", DAYTONA_SDK, "package.json"),
          "utf8",
        ),
      ) as { version: string };

      context.addLayer({
        id: "daytona-sdk",
        dependencies: { [DAYTONA_SDK]: version },
      });
    },
  };
}

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
    extensions: [
      daytonaSdk(),
      // Seeded into each new sandbox and never imported, so bundling would miss them
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
