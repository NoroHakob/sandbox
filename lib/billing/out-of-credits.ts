// No "server-only": shared by the worker, the session start action and the chat
// thread, so it holds only names

// Persisted in the assistant message of a blocked turn, so a reload still shows
// why the build never ran. Data parts are dropped when the history goes back
// to the model, so the notice never reaches it
export const OUT_OF_CREDITS_PART = "data-out-of-credits"

// Server action errors are redacted in production, so the start action returns
// this instead of throwing, and the client throws it for useChat to show
export const OUT_OF_CREDITS_ERROR = "OUT_OF_CREDITS"
