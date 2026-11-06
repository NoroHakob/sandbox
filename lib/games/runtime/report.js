// Error reporter. A plain script that runs before the game's modules, so it
// still reports when one of them fails to parse. The app polls it from outside
// the iframe: a "game-ping" is answered with the first error, or null.
(function () {
  // Must match the placeholder in components/chat-preview.tsx
  var GAME_ORIGIN = "https://game";
  var MAX_MESSAGE = 1000;
  var MAX_STACK = 2000;

  var firstError = null;

  // The origin of a signed preview URL holds its token. It's replaced before
  // the cut, as half a hostname could no longer be recognised afterwards
  function clean(value, max) {
    if (value === null || value === undefined || value === "") return null;

    try {
      return String(value).split(location.origin).join(GAME_ORIGIN).slice(0, max);
    } catch (_) {
      return null; // e.g. a rejection reason with no string form
    }
  }

  function position(value) {
    return typeof value === "number" ? value : null;
  }

  function record(error) {
    if (firstError) return;

    firstError = {
      message: clean(error.message, MAX_MESSAGE) || "Unknown error",
      source: clean(error.source, MAX_MESSAGE),
      line: position(error.line),
      column: position(error.column),
      stack: clean(error.stack, MAX_STACK),
    };
  }

  // Capturing, as a failed <script> or <link> fires "error" without bubbling
  window.addEventListener(
    "error",
    function (event) {
      if (event instanceof ErrorEvent) {
        record({
          message: event.message,
          source: event.filename,
          line: event.lineno,
          column: event.colno,
          stack: event.error && event.error.stack,
        });
        return;
      }

      var target = event.target;
      var url = target && (target.src || target.href);

      record({
        message: "Failed to load " + ((target && target.localName) || "resource") + ": " + url,
        source: url,
      });
    },
    true,
  );

  window.addEventListener("unhandledrejection", function (event) {
    var reason = event.reason;

    record({
      message: (reason && reason.message) || reason,
      stack: reason && reason.stack,
    });
  });

  window.addEventListener("message", function (event) {
    if (!event.source || !event.data || event.data.type !== "game-ping") return;

    event.source.postMessage({ type: "game-status", error: firstError }, event.origin);
  });
})();
