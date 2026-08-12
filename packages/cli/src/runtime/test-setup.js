/**
 * Vitest setup: provides mock registry integration for WIT shim testing.
 * Injected automatically by `glyph test`.
 *
 * Since the SDK now imports from glyph:extension/* specifiers,
 * and esbuild aliases those to the CLI's shim modules during test builds,
 * the shims are already inlined. This setup file wires up the mock registry
 * so that mockRequest/clearMocks from @glyphmoe/sdk/testing still work.
 */
import { findMock, isMockEnabled } from '@glyphmoe/sdk/test-runtime'

// The http shim checks this global to intercept requests during tests
global.__glyphMockRegistry = { findMock, isMockEnabled }
