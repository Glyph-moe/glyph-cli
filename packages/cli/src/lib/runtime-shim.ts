// Runtime shims are now handled by esbuild aliases in builder.ts.
// The WIT import specifiers (glyph:extension/http@0.1.0, etc.) are aliased
// to local shim modules during dev/validate builds.
// These strings are kept for any code that still references them.

/** @deprecated Use esbuild alias config instead. */
export const RUNTIME_SHIM = ''

/** @deprecated Use esbuild alias config instead. */
export const PLAYGROUND_RUNTIME = ''
