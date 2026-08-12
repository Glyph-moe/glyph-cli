/** WIT http shim — backed by synchronous HTTP for dev/validate/test. */
import { execFileSync } from 'child_process'

export function fetch(request: {
  url: string
  method: string
  headers: Array<{ name: string; value: string }>
  body: string | undefined
}): { status: number; headers: Array<{ name: string; value: string }>; body: string } {
  // Check mock registry (set by test-setup.js for unit tests)
  const registry = (globalThis as any).__glyphMockRegistry
  if (registry?.isMockEnabled()) {
    const mock = registry.findMock(request.url)
    if (mock) {
      return {
        status: mock.status ?? 200,
        headers: Object.entries(mock.headers ?? {}).map(([name, value]) => ({ name, value: value as string })),
        body: mock.body,
      }
    }
    throw new Error(`No mock registered for: ${request.url}`)
  }

  const headerObj: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  }
  for (const { name, value } of request.headers) {
    headerObj[name] = value
  }

  // Spawn a Node subprocess that does async fetch and prints JSON result.
  // This gives us synchronous HTTP to match WIT's sync semantics.
  const script = `(async()=>{try{const r=await fetch(process.argv[1],{method:process.argv[2],headers:JSON.parse(process.argv[3]),body:process.argv[4]||undefined});const b=await r.text();const h=[];r.headers.forEach((v,k)=>h.push({name:k,value:v}));process.stdout.write(JSON.stringify({status:r.status,headers:h,body:b}))}catch(e){process.stdout.write(JSON.stringify({status:0,headers:[],body:e.message}))}})()`

  const result = execFileSync('node', [
    '-e', script,
    request.url,
    request.method,
    JSON.stringify(headerObj),
    request.body ?? '',
  ], {
    encoding: 'utf-8',
    timeout: 30000,
    maxBuffer: 50 * 1024 * 1024,
  })
  return JSON.parse(result)
}
