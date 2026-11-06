import { task } from "@trigger.dev/sdk"

// Run from the Trigger.dev dashboard to check that failures reach Sentry
export const sentryErrorTest = task({
  id: "sentry-error-test",
  retry: { maxAttempts: 1 },
  run: async () => {
    throw new Error("Sentry test error from Trigger.dev")
  },
})
