// Turning a RustDesk server address into the WebSocket URL a browser can open.
//
// Same rules as the desktop client's check_ws (hbb_common/src/websocket.rs):
//  - a ws:// or wss:// URL is used as it is;
//  - an IP address is reached on the plain WebSocket port, two above the TCP one
//    (ID 21116 -> 21118, relay 21117 -> 21119);
//  - a domain is reached through the TLS bridge at wss://domain/ws/id (or
//    /ws/relay), without a port, which is how RustDesk's public servers and
//    self-hosted setups behind a reverse proxy expose it. A port that is not one
//    of RustDesk's own (21114-21119) is taken to be the proxy's TLS port.

export type EndpointKind = 'id' | 'relay';

const ID_PORT = 21116;
const RELAY_PORT = 21117;

const isIp = (host: string): boolean => /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[');

export function splitHostPort(value: string): { host: string; port: number | null } {
  const v = value.trim();
  const m = /^(\[[^\]]+\]|[^:]+)(?::(\d{1,5}))?$/.exec(v);
  return { host: m?.[1] ?? v, port: m?.[2] ? Number(m[2]) : null };
}

export function isWsUrl(value: string): boolean {
  return /^wss?:\/\//i.test(value.trim());
}

export function wsEndpoint(value: string, kind: EndpointKind): string {
  const v = value.trim();
  if (isWsUrl(v)) return v;
  const { host, port } = splitHostPort(v);
  if (isIp(host)) return `ws://${host}:${(port ?? (kind === 'id' ? ID_PORT : RELAY_PORT)) + 2}`;
  const tlsPort = port !== null && !(port >= 21114 && port <= 21119) ? `:${port}` : '';
  return `wss://${host}${tlsPort}/ws/${kind}`;
}
