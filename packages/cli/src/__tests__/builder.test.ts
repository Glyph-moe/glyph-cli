import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { validateBundle, generateIndex, type IndexSource } from '../lib/builder.js'

// Minimal IIFE bundle that mimics what esbuild produces with dev shims
function makeBundle(source: Record<string, unknown>): string {
  return `var GlyphExtension = (function() {
    var source = ${JSON.stringify(source)};
    Object.defineProperty(source, '__info', {
      value: source.__rawInfo,
      enumerable: false,
    });
    delete source.__rawInfo;
    return { default: source };
  })();
  if (typeof globalThis !== 'undefined') { globalThis.GlyphExtension = GlyphExtension; }`
}

function validReaderSource(overrides: Record<string, unknown> = {}) {
  return {
    __rawInfo: {
      id: 'test-source',
      name: 'Test Source',
      version: '1.0.0',
      baseUrl: 'https://example.com',
      icon: 'https://example.com/icon.png',
      language: 'en',
      sourceType: 'reader',
      ...overrides,
    },
    searchNovels: 'function(){}',
    fetchNovelDetails: 'function(){}',
    fetchChapterContent: 'function(){}',
  }
}

// We need functions to be real functions in the evaled bundle
function makeValidBundle(infoOverrides: Record<string, unknown> = {}, sourceType: 'reader' | 'download' = 'reader'): string {
  const info = {
    id: 'test-source',
    name: 'Test Source',
    version: '1.0.0',
    baseUrl: 'https://example.com',
    icon: 'https://example.com/icon.png',
    language: 'en',
    sourceType,
    ...infoOverrides,
  }
  const methods = sourceType === 'reader'
    ? `searchNovels: function(){}, fetchNovelDetails: function(){}, fetchChapterContent: function(){}`
    : `searchNovels: function(){}, fetchNovelDetails: function(){}, getDownloadLinks: function(){}`

  return `var GlyphExtension = (function() {
    var source = { ${methods} };
    Object.defineProperty(source, '__info', {
      value: ${JSON.stringify(info)},
      enumerable: false,
    });
    return { source: source };
  })();
  if (typeof globalThis !== 'undefined') { globalThis.GlyphExtension = GlyphExtension; }`
}

let tmpDir: string

describe('validateBundle', () => {
  beforeEach(() => {
    tmpDir = join(tmpdir(), `glyph-test-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('passes for a valid reader source', () => {
    const bundlePath = join(tmpDir, 'test.js')
    writeFileSync(bundlePath, makeValidBundle())
    const result = validateBundle('test-source', bundlePath)
    expect(result.passed).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.info).toBeDefined()
    expect(result.info!.id).toBe('test-source')
  })

  it('passes for a valid download source', () => {
    const bundlePath = join(tmpDir, 'test.js')
    writeFileSync(bundlePath, makeValidBundle({}, 'download'))
    const result = validateBundle('test-source', bundlePath)
    expect(result.passed).toBe(true)
  })

  it('fails when bundle cannot be evaluated', () => {
    const bundlePath = join(tmpDir, 'bad.js')
    writeFileSync(bundlePath, 'this is not valid javascript {{{{')
    const result = validateBundle('bad', bundlePath)
    expect(result.passed).toBe(false)
    expect(result.errors[0].field).toBe('bundle')
  })

  it('fails when info.id is missing', () => {
    const bundlePath = join(tmpDir, 'test.js')
    writeFileSync(bundlePath, makeValidBundle({ id: '' }))
    const result = validateBundle('test-source', bundlePath)
    expect(result.passed).toBe(false)
    expect(result.errors.some(e => e.field === 'info.id')).toBe(true)
  })

  it('fails when info.name is missing', () => {
    const bundlePath = join(tmpDir, 'test.js')
    writeFileSync(bundlePath, makeValidBundle({ name: '' }))
    const result = validateBundle('test-source', bundlePath)
    expect(result.passed).toBe(false)
    expect(result.errors.some(e => e.field === 'info.name')).toBe(true)
  })

  it('fails when info.baseUrl is missing', () => {
    const bundlePath = join(tmpDir, 'test.js')
    writeFileSync(bundlePath, makeValidBundle({ baseUrl: '' }))
    const result = validateBundle('test-source', bundlePath)
    expect(result.passed).toBe(false)
    expect(result.errors.some(e => e.field === 'info.baseUrl')).toBe(true)
  })

  it('fails when required methods are missing', () => {
    const bundlePath = join(tmpDir, 'test.js')
    // Bundle with info but no methods
    writeFileSync(bundlePath, `var GlyphExtension = (function() {
      var source = {};
      Object.defineProperty(source, '__info', {
        value: ${JSON.stringify({
          id: 'x', name: 'X', version: '1', baseUrl: 'https://x.com',
          icon: 'https://x.com/i.png', language: 'en',
        })},
        enumerable: false,
      });
      return { default: source };
    })();`)
    const result = validateBundle('x', bundlePath)
    expect(result.passed).toBe(false)
    expect(result.errors.some(e => e.field === 'searchNovels')).toBe(true)
    expect(result.errors.some(e => e.field === 'fetchNovelDetails')).toBe(true)
  })

  it('fails when reader source is missing fetchChapterContent', () => {
    const bundlePath = join(tmpDir, 'test.js')
    writeFileSync(bundlePath, `var GlyphExtension = (function() {
      var source = { searchNovels: function(){}, fetchNovelDetails: function(){} };
      Object.defineProperty(source, '__info', {
        value: ${JSON.stringify({
          id: 'x', name: 'X', version: '1', baseUrl: 'https://x.com',
          icon: 'https://x.com/i.png', language: 'en', sourceType: 'reader',
        })},
        enumerable: false,
      });
      return { default: source };
    })();`)
    const result = validateBundle('x', bundlePath)
    expect(result.passed).toBe(false)
    expect(result.errors.some(e => e.field === 'fetchChapterContent')).toBe(true)
  })

  it('marks icon and version as fixable errors', () => {
    const bundlePath = join(tmpDir, 'test.js')
    writeFileSync(bundlePath, makeValidBundle({ icon: '', version: '' }))
    const result = validateBundle('test-source', bundlePath)
    const iconErr = result.errors.find(e => e.field === 'info.icon')
    const versionErr = result.errors.find(e => e.field === 'info.version')
    expect(iconErr?.fixable).toBe(true)
    expect(versionErr?.fixable).toBe(true)
  })

  it('extracts __capabilities from the bundle', () => {
    const bundlePath = join(tmpDir, 'test.js')
    const info = {
      id: 'test-source', name: 'Test Source', version: '1.0.0',
      baseUrl: 'https://example.com', icon: 'https://example.com/icon.png',
      language: 'en', sourceType: 'reader',
    }
    writeFileSync(bundlePath, `var GlyphExtension = (function() {
      var source = { searchNovels: function(){}, fetchNovelDetails: function(){}, fetchChapterContent: function(){} };
      Object.defineProperty(source, '__info', { value: ${JSON.stringify(info)}, enumerable: false });
      Object.defineProperty(source, '__capabilities', { value: ['discover', 'filters'], enumerable: false });
      return { source: source };
    })();
    if (typeof globalThis !== 'undefined') { globalThis.GlyphExtension = GlyphExtension; }`)
    const result = validateBundle('test-source', bundlePath)
    expect(result.passed).toBe(true)
    expect(result.capabilities).toEqual(['discover', 'filters'])
  })

  it('returns empty capabilities when bundle has no __capabilities (back-compat)', () => {
    const bundlePath = join(tmpDir, 'test.js')
    writeFileSync(bundlePath, makeValidBundle())
    const result = validateBundle('test-source', bundlePath)
    expect(result.passed).toBe(true)
    expect(result.capabilities).toEqual([])
  })
})

describe('generateIndex', () => {
  beforeEach(() => {
    tmpDir = join(tmpdir(), `glyph-test-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('writes a valid index.json with sources', () => {
    const sources: IndexSource[] = [
      {
        id: 'src-a',
        name: 'Source A',
        version: '1.0.0',
        language: 'en',
        icon: 'https://example.com/a.png',
        nsfw: false,
        type: 'js',
        bundleUrl: 'https://example.com/dist/src-a.js',
        sha256: 'abc123',
      },
    ]

    generateIndex({
      distDir: tmpDir,
      repoConfig: {
        name: 'Test Repo',
        author: 'tester',
        description: 'A test repo',
        website: 'https://example.com',
        url: 'https://example.github.io/test',
      },
      sources,
    })

    const indexPath = join(tmpDir, 'index.json')
    const index = JSON.parse(readFileSync(indexPath, 'utf-8'))
    expect(index.name).toBe('Test Repo')
    expect(index.author).toBe('tester')
    expect(index.repository).toBe('https://example.github.io/test')
    expect(index.sources).toHaveLength(1)
    expect(index.sources[0].id).toBe('src-a')
    expect(index.sources[0].sha256).toBe('abc123')
  })

  it('writes empty sources array when no sources provided', () => {
    generateIndex({
      distDir: tmpDir,
      repoConfig: {
        name: 'Empty',
        author: 'nobody',
        description: '',
        website: '',
        url: 'https://x.github.io/empty',
      },
      sources: [],
    })

    const index = JSON.parse(readFileSync(join(tmpDir, 'index.json'), 'utf-8'))
    expect(index.sources).toEqual([])
  })

  it('includes optional fields when present', () => {
    const sources: IndexSource[] = [
      {
        id: 'dl-src',
        name: 'Download Source',
        version: '2.0.0',
        language: 'fr',
        icon: 'https://x.com/icon.png',
        nsfw: true,
        type: 'js',
        dev: 'author-name',
        bundleUrl: 'https://x.com/dist/dl-src.js',
        sha256: 'def456',
        requiresLogin: true,
        loginUrl: 'https://x.com/login',
        sourceType: 'download',
      },
    ]

    generateIndex({
      distDir: tmpDir,
      repoConfig: { name: 'R', author: 'A', description: 'D', website: 'W', url: 'U' },
      sources,
    })

    const index = JSON.parse(readFileSync(join(tmpDir, 'index.json'), 'utf-8'))
    const src = index.sources[0]
    expect(src.nsfw).toBe(true)
    expect(src.dev).toBe('author-name')
    expect(src.requiresLogin).toBe(true)
    expect(src.loginUrl).toBe('https://x.com/login')
    expect(src.sourceType).toBe('download')
    expect(src.sha256).toBe('def456')
  })

  it('writes capabilities array on index sources when provided', () => {
    const sources: IndexSource[] = [
      {
        id: 'src-c',
        name: 'Source C',
        version: '1.2.0',
        language: 'en',
        icon: 'https://example.com/c.png',
        nsfw: false,
        type: 'js',
        bundleUrl: 'https://example.com/dist/src-c.js',
        sha256: 'cafebabe',
        capabilities: ['discover', 'filters', 'login'],
      },
    ]

    generateIndex({
      distDir: tmpDir,
      repoConfig: { name: 'R', author: 'A', description: 'D', website: 'W', url: 'U' },
      sources,
    })

    const index = JSON.parse(readFileSync(join(tmpDir, 'index.json'), 'utf-8'))
    expect(index.sources[0].capabilities).toEqual(['discover', 'filters', 'login'])
  })

  it('omits capabilities key when not provided (back-compat)', () => {
    const sources: IndexSource[] = [
      {
        id: 'src-d',
        name: 'Source D',
        version: '1.0.0',
        language: 'en',
        icon: 'https://example.com/d.png',
        nsfw: false,
        type: 'js',
        bundleUrl: 'https://example.com/dist/src-d.js',
        sha256: 'beadfeed',
      },
    ]

    generateIndex({
      distDir: tmpDir,
      repoConfig: { name: 'R', author: 'A', description: 'D', website: 'W', url: 'U' },
      sources,
    })

    const index = JSON.parse(readFileSync(join(tmpDir, 'index.json'), 'utf-8'))
    expect('capabilities' in index.sources[0]).toBe(false)
  })
})
