import { networkInterfaces } from 'os'

// Prefer common physical LAN interfaces over VPN/tunnel/container interfaces
const PREFERRED_IFACE = /^(en|eth|wlan|Wi-Fi)/i
const TUNNEL_IFACE = /^(utun|tun|tap|docker|br-|veth|tailscale|wg|vmnet)/i

export function getLanIP(): string {
  const nets = networkInterfaces()
  let fallback: string | undefined
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family !== 'IPv4' || net.internal) continue
      if (PREFERRED_IFACE.test(name)) return net.address
      if (!TUNNEL_IFACE.test(name) && !fallback) fallback = net.address
    }
  }
  return fallback ?? 'localhost'
}
