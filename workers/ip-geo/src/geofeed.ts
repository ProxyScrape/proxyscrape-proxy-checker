/**
 * geofeed.ts — Parse, store, and binary-search geofeed CIDR ranges.
 *
 * Ranges are fetched from GEOFEED_URL, parsed into sorted integer ranges,
 * and persisted to KV. A module-scope cache keeps them in memory for the
 * lifetime of the isolate so KV is only hit once per cold start.
 *
 * Priority: geofeed data always overwrites ip-api.com results for matching IPs.
 */

const KV_KEY = 'ranges:v1';

// Invalidate the module-scope cache after 12 hours so a new isolate never
// serves ranges more than ~12 h stale (the cron refreshes KV weekly).
const MODULE_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Stored types (serialised to KV as JSON)
// ---------------------------------------------------------------------------

interface V4Range {
  s: number; // start as uint32
  e: number; // end   as uint32
  cc: string;
  rc: string; // region code e.g. "VA"
  ci: string; // city
}

interface V6Range {
  s: string; // start as decimal BigInt string
  e: string; // end   as decimal BigInt string
  cc: string;
  rc: string;
  ci: string;
}

export interface StoredRanges {
  v4: V4Range[];
  v6: V6Range[];
}

export interface GeoOverride {
  countryCode: string;
  region: string; // ISO 3166-2 suffix e.g. "VA"
  city: string;
}

// ---------------------------------------------------------------------------
// Module-scope cache (per isolate — safe; this is config, not request state)
// ---------------------------------------------------------------------------

let cached: StoredRanges | null = null;
let cachedAt = 0;

// ---------------------------------------------------------------------------
// IPv4 helpers
// ---------------------------------------------------------------------------

function ipv4ToUint32(ip: string): number {
  const p = ip.split('.');
  return (
    ((parseInt(p[0], 10) << 24) |
      (parseInt(p[1], 10) << 16) |
      (parseInt(p[2], 10) << 8) |
      parseInt(p[3], 10)) >>>
    0
  );
}

function cidrV4ToRange(cidr: string): { s: number; e: number } | null {
  try {
    const slash = cidr.indexOf('/');
    const ip = slash === -1 ? cidr : cidr.slice(0, slash);
    const prefix = slash === -1 ? 32 : parseInt(cidr.slice(slash + 1), 10);
    const start = ipv4ToUint32(ip);
    if (isNaN(start) || isNaN(prefix) || prefix < 0 || prefix > 32) return null;
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    const end = (start | (~mask >>> 0)) >>> 0;
    return { s: start, e: end };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// IPv6 helpers
// ---------------------------------------------------------------------------

function expandIPv6(ip: string): string {
  const halves = ip.split('::');
  if (halves.length === 2) {
    const left = halves[0] ? halves[0].split(':') : [];
    const right = halves[1] ? halves[1].split(':') : [];
    const fill = 8 - left.length - right.length;
    const middle = Array<string>(fill).fill('0');
    return [...left, ...middle, ...right].map(g => g.padStart(4, '0')).join(':');
  }
  return ip
    .split(':')
    .map(g => g.padStart(4, '0'))
    .join(':');
}

function ipv6ToBigInt(ip: string): bigint {
  return expandIPv6(ip)
    .split(':')
    .reduce((acc, g) => (acc << 16n) | BigInt(parseInt(g, 16)), 0n);
}

function cidrV6ToRange(cidr: string): { s: string; e: string } | null {
  try {
    const slash = cidr.indexOf('/');
    const ip = slash === -1 ? cidr : cidr.slice(0, slash);
    const prefix = slash === -1 ? 128 : parseInt(cidr.slice(slash + 1), 10);
    if (isNaN(prefix) || prefix < 0 || prefix > 128) return null;
    const start = ipv6ToBigInt(ip);
    const end = prefix === 128 ? start : start | ((1n << BigInt(128 - prefix)) - 1n);
    return { s: start.toString(), e: end.toString() };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export function parseGeofeedCSV(text: string): StoredRanges {
  const v4: V4Range[] = [];
  const v6: V6Range[] = [];

  for (const raw of text.split('\n')) {
    const line = raw.split('#')[0].trim(); // strip inline comments
    if (!line) continue;

    const parts = line.split(',');
    if (parts.length < 2) continue;

    const network = parts[0].trim();
    const cc = parts[1].trim();
    const regionFull = (parts[2] ?? '').trim(); // e.g. "US-VA"
    const city = (parts[3] ?? '').trim();

    if (!network || !cc) continue;

    // Strip country prefix from region code: "US-VA" → "VA"
    const rc = regionFull.includes('-') ? regionFull.split('-').slice(1).join('-') : regionFull;

    if (network.includes(':')) {
      const range = cidrV6ToRange(network);
      if (range) v6.push({ ...range, cc, rc, ci: city });
    } else {
      const range = cidrV4ToRange(network);
      if (range) v4.push({ ...range, cc, rc, ci: city });
    }
  }

  v4.sort((a, b) => a.s - b.s);
  v6.sort((a, b) => (BigInt(a.s) < BigInt(b.s) ? -1 : BigInt(a.s) > BigInt(b.s) ? 1 : 0));

  return { v4, v6 };
}

// ---------------------------------------------------------------------------
// Binary search
// ---------------------------------------------------------------------------

function searchV4(ip: number, ranges: V4Range[]): V4Range | null {
  let lo = 0,
    hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (ip < ranges[mid].s) hi = mid - 1;
    else if (ip > ranges[mid].e) lo = mid + 1;
    else return ranges[mid];
  }
  return null;
}

function searchV6(ip: bigint, ranges: V6Range[]): V6Range | null {
  let lo = 0,
    hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const s = BigInt(ranges[mid].s);
    const e = BigInt(ranges[mid].e);
    if (ip < s) hi = mid - 1;
    else if (ip > e) lo = mid + 1;
    else return ranges[mid];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function loadRanges(kv: KVNamespace): Promise<StoredRanges> {
  const now = Date.now();
  if (cached && now - cachedAt < MODULE_CACHE_TTL_MS) return cached;

  const stored = await kv.get<StoredRanges>(KV_KEY, 'json');
  cached = stored ?? { v4: [], v6: [] };
  cachedAt = now;
  return cached;
}

export function lookupGeofeed(ip: string, ranges: StoredRanges): GeoOverride | null {
  try {
    if (ip.includes(':')) {
      const match = searchV6(ipv6ToBigInt(ip), ranges.v6);
      if (!match) return null;
      return { countryCode: match.cc, region: match.rc, city: match.ci };
    } else {
      const match = searchV4(ipv4ToUint32(ip), ranges.v4);
      if (!match) return null;
      return { countryCode: match.cc, region: match.rc, city: match.ci };
    }
  } catch {
    return null;
  }
}

export async function refreshGeofeed(geofeedUrl: string, kv: KVNamespace): Promise<number> {
  const resp = await fetch(geofeedUrl, {
    headers: { 'User-Agent': 'ip-geo-worker/1.0' },
  });
  if (!resp.ok) throw new Error(`Geofeed fetch failed: ${resp.status} ${resp.statusText}`);

  const text = await resp.text();
  const ranges = parseGeofeedCSV(text);
  await kv.put(KV_KEY, JSON.stringify(ranges));

  // Update module-scope cache immediately
  cached = ranges;
  cachedAt = Date.now();

  return ranges.v4.length + ranges.v6.length;
}
