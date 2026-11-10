// api/_after_response.js
// Lets a function answer straight away and finish slow work afterwards, on Vercel.
//
// Vercel normally freezes a function as soon as it has sent its response. Work handed to
// Vercel's `waitUntil` keeps it alive until that work is done. This is the same lookup that
// Vercel's own `@vercel/functions` package does (`getContext().waitUntil`); it is written out
// here so the site doesn't need that package and its dependencies.

const REQUEST_CONTEXT = Symbol.for('@vercel/request-context');

/**
 * Vercel's `waitUntil` for the current request, or null when it isn't available (running
 * outside Vercel, e.g. tests, or if Vercel ever changes this hook). Callers must then do the
 * work BEFORE responding, so nothing is ever left unfinished.
 * @returns {((promise: Promise<any>) => void) | null}
 */
export function getWaitUntil() {
  const context = globalThis[REQUEST_CONTEXT]?.get?.();
  return typeof context?.waitUntil === 'function' ? (p) => context.waitUntil(p) : null;
}
