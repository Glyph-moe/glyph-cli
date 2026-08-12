import { spawnSync } from 'child_process'
import { existsSync, readFileSync, mkdirSync, writeFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { GlyphError } from '../utils/errors.js'

/** Build a PATH that prefers rustup's toolchain over Homebrew's cargo/rustc. */
function rustupEnv(): Record<string, string> {
  const env = { ...process.env }
  const rustupHome = env.RUSTUP_HOME ?? join(homedir(), '.rustup')
  const sysroot = spawnSync('rustup', ['run', 'stable', 'rustc', '--print', 'sysroot'], {
    encoding: 'utf-8',
    stdio: 'pipe',
    env,
  })
  if (sysroot.status === 0) {
    const bin = join(sysroot.stdout.trim(), 'bin')
    const cargoHome = env.CARGO_HOME ?? join(homedir(), '.cargo')
    env.PATH = `${bin}:${join(cargoHome, 'bin')}:${env.PATH ?? ''}`
    env.RUSTUP_HOME = rustupHome
  }
  return env
}

/** Check that Rust WASM toolchain is available. */
export function checkRustPrerequisites(): void {
  const cargo = spawnSync('cargo', ['component', '--version'], { encoding: 'utf-8', stdio: 'pipe' })
  if (cargo.status !== 0) {
    throw new GlyphError(
      'cargo-component is not installed.',
      'Install it with: cargo install cargo-component\n'
      + 'Also ensure the wasm32-wasip2 target is added: rustup target add wasm32-wasip2',
    )
  }

  const jco = spawnSync('npx', ['@bytecodealliance/jco', '--version'], { encoding: 'utf-8', stdio: 'pipe' })
  if (jco.status !== 0) {
    throw new GlyphError(
      'jco is not available.',
      'Install it with: npm install -g @bytecodealliance/jco\n'
      + 'Or add it as a project dependency: npm install -D @bytecodealliance/jco',
    )
  }
}

/** Read source metadata from source.json in a Rust extension directory. */
export function readRustSourceMeta(sourceDir: string): Record<string, unknown> {
  const metaPath = join(sourceDir, 'source.json')
  if (!existsSync(metaPath)) {
    throw new GlyphError(
      `Missing source.json in ${sourceDir}`,
      'Rust extensions need a source.json with id, name, version, baseUrl, icon, language fields.',
    )
  }
  return JSON.parse(readFileSync(metaPath, 'utf-8'))
}

export interface RustBuildOpts {
  sourceDir: string
  sourceId: string
  distDir: string
}

/** Build a Rust extension: cargo component build + jco transpile. */
export async function buildRustSource(opts: RustBuildOpts): Promise<void> {
  const { sourceDir, sourceId, distDir } = opts
  const outDir = join(distDir, sourceId)
  mkdirSync(outDir, { recursive: true })

  // 1. cargo component build
  const env = rustupEnv()
  const cargoResult = spawnSync('cargo', ['component', 'build', '--release'], {
    cwd: sourceDir,
    encoding: 'utf-8',
    stdio: 'pipe',
    env,
  })

  if (cargoResult.status !== 0) {
    const stderr = cargoResult.stderr || cargoResult.stdout || 'Unknown error'
    throw new GlyphError(
      `Rust build failed for ${sourceId}`,
      stderr.slice(0, 2000),
    )
  }

  // Find the .wasm output (cargo-component may target wasip1 or wasip2)
  const cargoToml = readFileSync(join(sourceDir, 'Cargo.toml'), 'utf-8')
  const nameMatch = cargoToml.match(/^name\s*=\s*"([^"]+)"/m)
  const crateName = nameMatch ? nameMatch[1].replace(/-/g, '_') : sourceId.replace(/-/g, '_')

  const wasip1 = join(sourceDir, 'target', 'wasm32-wasip1', 'release', `${crateName}.wasm`)
  const wasip2 = join(sourceDir, 'target', 'wasm32-wasip2', 'release', `${crateName}.wasm`)
  const wasmPath = existsSync(wasip2) ? wasip2 : existsSync(wasip1) ? wasip1 : null

  if (!wasmPath) {
    throw new GlyphError(
      `WASM output not found for ${sourceId}`,
      `Checked:\n  ${wasip2}\n  ${wasip1}\nCheck the Cargo.toml package name and that the build succeeded.`,
    )
  }

  // 2. jco transpile
  const jcoResult = spawnSync('npx', [
    '@bytecodealliance/jco', 'transpile', wasmPath,
    '-o', outDir,
    '--name', 'ext',
    '--instantiation', 'sync',
  ], {
    encoding: 'utf-8',
    stdio: 'pipe',
  })

  if (jcoResult.status !== 0) {
    const stderr = jcoResult.stderr || jcoResult.stdout || 'Unknown error'
    throw new GlyphError(
      `JCO transpile failed for ${sourceId}`,
      stderr.slice(0, 2000),
    )
  }

  // 3. Bundle into a single self-contained JS file
  //    Inline .wasm files as base64, rewrite ext.js to auto-instantiate,
  //    and export `source` like a normal JS extension.
  bundleWasmInline(outDir)
}

/**
 * Reads the JCO output (ext.js + *.core*.wasm), inlines the WASM as base64,
 * and produces a single IIFE bundle that the app can load like any JS extension.
 */
function bundleWasmInline(outDir: string): void {
  const extJsPath = join(outDir, 'ext.js')
  let extJs = readFileSync(extJsPath, 'utf-8')

  // Collect all .wasm files and encode as base64
  const wasmFiles = readdirSync(outDir).filter(f => f.endsWith('.wasm'))
  const wasmModules: Record<string, string> = {}
  for (const file of wasmFiles) {
    const data = readFileSync(join(outDir, file))
    wasmModules[file] = data.toString('base64')
  }

  // Strip the ESM export — convert to a plain function body
  extJs = extJs.replace(/^"use components";\s*/, '')
  extJs = extJs.replace(/^export function instantiate/, 'function instantiate')

  // Generate the self-contained bundle
  const bundle = `// @glyph-wasm-extension
var GlyphExtension = (function() {
  // Inline WASM modules as base64
  var __wasmModules = {
${Object.entries(wasmModules).map(([name, b64]) =>
    `    ${JSON.stringify(name)}: ${JSON.stringify(b64)}`).join(',\n')}
  };

  function __decodeBase64(b64) {
    var raw = atob(b64);
    var bytes = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes.buffer;
  }

  var __compiledCache = {};
  function getCoreModule(name) {
    if (!__compiledCache[name]) {
      var b64 = __wasmModules[name];
      if (!b64) throw new Error('WASM module not found: ' + name);
      __compiledCache[name] = new WebAssembly.Module(__decodeBase64(b64));
    }
    return __compiledCache[name];
  }

  // JCO instantiate function (inlined)
  ${extJs}

  // WASI stubs — the extension doesn't use filesystem/stdio but JCO requires them.
  var __noopStream = function() {
    return {
      read: function() { return { tag: 'err', val: { tag: 'closed' } }; },
      write: function(bytes) { return bytes.length; },
      blockingWriteAndFlush: function(bytes) { return bytes.length; },
      blockingFlush: function() {},
      subscribe: function() { return {}; },
      drop: function() {},
    };
  };
  var __wasiStubs = {
    'wasi:cli/environment': { getEnvironment: function() { return []; } },
    'wasi:cli/exit': { exit: function(code) { throw new Error('exit: ' + JSON.stringify(code)); } },
    'wasi:cli/stderr': { getStderr: __noopStream },
    'wasi:cli/stdin': { getStdin: __noopStream },
    'wasi:cli/stdout': { getStdout: __noopStream },
    'wasi:clocks/wall-clock': { now: function() { return { seconds: BigInt(0), nanoseconds: 0 }; } },
    'wasi:filesystem/preopens': { getDirectories: function() { return []; } },
    'wasi:filesystem/types': {
      Descriptor: function() {},
      filesystemErrorCode: function() { return undefined; },
    },
    'wasi:io/error': { Error: function() {} },
    'wasi:io/streams': { InputStream: __noopStream, OutputStream: __noopStream },
  };

  // Auto-instantiate with WIT bridge imports + WASI stubs
  var __imports = {};
  // Add WASI stubs
  for (var k in __wasiStubs) __imports[k] = __wasiStubs[k];
  // Add Glyph WIT imports (JCO strips the version from keys)
  __imports['glyph:extension/http'] = window.__wit.http;
  __imports['glyph:extension/html'] = window.__wit.html;
  __imports['glyph:extension/host'] = window.__wit.host;

  var result = instantiate(getCoreModule, __imports);
  var raw = result.source || result['glyph:extension/source@0.1.0'];

  // ── WIT → SDK format translation ─────────────────────────────
  // JCO uses WIT names (kebab-case enums, { tag, val } variants,
  // sectionType). The app expects SDK names (camelCase enums,
  // flat objects with type discriminator, "type" field).

  var __sectionTypeMap = {
    'featured': 'featured',
    'simple-carousel': 'simpleCarousel',
    'chapter-updates': 'chapterUpdates',
    'genres': 'genres',
  };

  var __itemTagMap = {
    'featured': 'featured',
    'simple-carousel': 'simpleCarousel',
    'chapter-update': 'chapterUpdate',
    'genre': 'genre',
  };

  function __mapSection(s) {
    return { id: s.id, title: s.title, subtitle: s.subtitle, type: __sectionTypeMap[s.sectionType] || s.sectionType };
  }

  function __mapItem(item) {
    // JCO variant: { tag: 'featured', val: { novelId, ... } }
    // SDK format:  { type: 'featured', novelId, ... }
    if (item && item.tag && item.val) {
      var out = {};
      for (var k in item.val) out[k] = item.val[k];
      out.type = __itemTagMap[item.tag] || item.tag;
      return out;
    }
    return item;
  }

  function __mapStatus(s) {
    if (!s) return s;
    // WIT enums are already lowercase strings, just pass through
    return s;
  }

  var source = {
    getSourceType: raw.getSourceType,
    searchNovels: function(q, p) {
      var r = raw.searchNovels(q, p);
      if (r && r.items) {
        r.items = r.items.map(function(n) {
          if (n.contentRating === undefined) delete n.contentRating;
          return n;
        });
      }
      return r;
    },
    fetchNovelDetails: function(url) { return raw.fetchNovelDetails(url); },
    fetchChapterContent: function(url) { return raw.fetchChapterContent(url); },
    getDownloadLinks: raw.getDownloadLinks,
    getDiscoverSections: function() {
      var r = raw.getDiscoverSections();
      return r ? r.map(__mapSection) : r;
    },
    getDiscoverSectionItems: function(id, page) {
      var r = raw.getDiscoverSectionItems(id, page);
      if (r && r.items) r.items = r.items.map(__mapItem);
      return r;
    },
    getDiscoverItems: raw.getDiscoverItems,
    fetchChaptersList: raw.fetchChaptersList,
  };

  return { source: source };
})();
if (typeof globalThis !== "undefined") {
  globalThis.GlyphExtension = GlyphExtension;
  globalThis.source = GlyphExtension.source;
}
`

  writeFileSync(extJsPath, bundle, 'utf-8')
}
