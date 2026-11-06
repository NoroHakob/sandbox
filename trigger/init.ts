import * as Sentry from "@sentry/node"
import { tasks } from "@trigger.dev/sdk"

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  // Trigger.dev owns OpenTelemetry inside runs
  defaultIntegrations: false,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
})

// Runs once a run has exhausted its retries. The hook's payload is deliberately
// not attached: chat payloads contain player prompts.
tasks.onFailure(async ({ ctx, error }) => {
  Sentry.withScope((scope) => {
    scope.setTags({
      "trigger.task_id": ctx.task.id,
      "trigger.run_id": ctx.run.id,
      "trigger.attempt": ctx.attempt.number,
      "trigger.environment_type": ctx.environment.type,
    })
    scope.setContext("trigger", ctx)
    scope.addEventProcessor((event) => {
      event.environment = ctx.environment.slug
      return event
    })
    Sentry.captureException(error)
  })

  await Sentry.flush(2000)
})
