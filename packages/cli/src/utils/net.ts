import { networkInterfaces } from 'os'

const TUNNEL_IFACE = /^(utun|tun|tap|docker|veth|tailscale|wg|vmnet)/i

export interface NetworkIP {
  address: string
  iface: string
}

/** Returns all non-internal IPv4 addresses, sorted: physical first, then bridges, tunnels excluded. */
export function getAllIPs(): NetworkIP[] {
  const nets = networkInterfaces()
  const results: NetworkIP[] = []
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family !== 'IPv4' || net.internal) continue
      if (TUNNEL_IFACE.test(name)) continue
      results.push({ address: net.address, iface: name })
    }
  }
  // Sort: en*/eth*/wlan* first, then bridge*, then rest
  results.sort((a, b) => {
    const scoreA = /^(en|eth|wlan|Wi-Fi)/i.test(a.iface) ? 0 : /^bridge/i.test(a.iface) ? 1 : 2
    const scoreB = /^(en|eth|wlan|Wi-Fi)/i.test(b.iface) ? 0 : /^bridge/i.test(b.iface) ? 1 : 2
    return scoreA - scoreB
  })
  return results
}

/** Returns the best-guess LAN IP (first result from getAllIPs). */
export function getLanIP(): string {
  return getAllIPs()[0]?.address ?? 'localhost'
}
