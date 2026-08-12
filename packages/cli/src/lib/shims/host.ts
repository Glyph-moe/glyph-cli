/** WIT host shim — mock cookies, UA, content rating for dev/validate/test. */

const cookieStore = new Map<string, Map<string, string>>()

export function getCookies(url: string): Array<[string, string]> {
  const jar = cookieStore.get(url)
  return jar ? [...jar.entries()] : []
}

export function setCookie(url: string, name: string, value: string): void {
  if (!cookieStore.has(url)) cookieStore.set(url, new Map())
  cookieStore.get(url)!.set(name, value)
}

export function getMaxContentRating(): 'everyone' | 'teen' | 'mature' | 'adult' {
  return 'adult'
}

export function getDefaultUserAgent(): string {
  return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
}
