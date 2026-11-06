import type { ErrorEvent, EventHint } from "@sentry/core"
import { DrizzleQueryError } from "drizzle-orm/errors"

// No "server-only": Next.js and the Trigger.dev worker both use this. @sentry/core
// writes to whichever Sentry client the runtime initialized
export { logger } from "@sentry/core"

const OMITTED = "Message omitted: it quotes the payload"

// Drizzle's message lists the query's params, which include chat messages and
// access tokens, and the AI SDK's parse errors quote the text they failed on.
// Matched as text because Drizzle sets no error name, and to catch wrappers
// that copy the message. Everything after the marker goes
const PAYLOAD_TEXT =
  /(?:Failed query: |JSON parsing failed: |Type validation failed)[\s\S]*/

function scrubText(text: string, replacement = OMITTED) {
  return text.replace(PAYLOAD_TEXT, () => replacement)
}

// Safe to log. A DrizzleQueryError's cause is the useful part
export function describeError(error: unknown) {
  const source = error instanceof DrizzleQueryError ? error.cause : error

  return {
    "exception.type": source instanceof Error ? source.name : typeof source,
    "exception.message": scrubText(
      source instanceof Error ? source.message : String(source)
    ),
  }
}

// Nested, as console breadcrumbs keep their arguments in data.arguments. A
// normalized DrizzleQueryError keeps its params as separate strings, which the
// text match can't see. Sentry has already normalized these, so no cycles
function scrubValue(value: unknown): unknown {
  if (typeof value === "string") return scrubText(value)
  if (Array.isArray(value)) return value.map(scrubValue)
  if (typeof value !== "object" || value === null) return value

  const isQueryError = "query" in value && "params" in value

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      isQueryError && key === "params" ? OMITTED : scrubValue(item),
    ])
  )
}

// For Sentry's beforeSend, as captured errors skip describeError. Runs after
// the integrations, so this also covers linked errors
export function scrubErrorEvent(event: ErrorEvent, hint: EventHint) {
  const { originalException } = hint
  const replacement =
    originalException instanceof DrizzleQueryError
      ? describeError(originalException)["exception.message"]
      : OMITTED

  for (const exception of event.exception?.values ?? []) {
    if (exception.value) {
      exception.value = scrubText(exception.value, replacement)
    }
  }
  if (event.message) event.message = scrubText(event.message, replacement)
  if (event.logentry?.message) {
    event.logentry.message = scrubText(event.logentry.message, replacement)
  }
  for (const breadcrumb of event.breadcrumbs ?? []) {
    if (breadcrumb.message) breadcrumb.message = scrubText(breadcrumb.message)
    if (breadcrumb.data) {
      breadcrumb.data = scrubValue(breadcrumb.data) as typeof breadcrumb.data
    }
  }

  return event
}

export function elapsed(start: number) {
  return Math.round(performance.now() - start)
}
