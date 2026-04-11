/**
 * Vitest setup: mocks the Glyph iOS runtime globals.
 * Injected automatically by `glyph test`.
 */
import { findMock, isMockEnabled } from '@glyphmoe/sdk/test-runtime'

global.Application = {
  async scheduleRequest(request) {
    const mock = findMock(request.url)
    if (mock) {
      return [
        { status: mock.status ?? 200, headers: mock.headers ?? {} },
        mock.body,
      ]
    }
    if (isMockEnabled()) {
      throw new Error(
        `No mock registered for: ${request.url}\n` +
          `Register one with: mockRequest('${request.url}', { body: '...' })`,
      )
    }
    // Fallback to real fetch (integration test mode)
    const resp = await fetch(request.url, {
      method: request.method,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        ...request.headers,
      },
      body: request.body ?? undefined,
    })
    const text = await resp.text()
    return [
      {
        status: resp.status,
        headers: Object.fromEntries(resp.headers.entries()),
      },
      text,
    ]
  },
  async getDefaultUserAgent() {
    return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  },
  async getCookies(_url) {
    return {}
  },
  setCookie(_url, _name, _value) {},
  async getMaxContentRating() {
    return 'adult'
  },
}
