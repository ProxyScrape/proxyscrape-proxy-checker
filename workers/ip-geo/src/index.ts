/**
 * ip-geo-worker — Concurrent IP geolocation via ip-api.com pro.
 *
 * POST /
 *   Body: { "ips": ["1.2.3.4", ...], "fields"?: "country,countryCode,..." }
 *   Returns: { "results": [ <ip-api response per IP, geofeed overrides applied> ] }
 *
 * IPs that fall within our geofeed ranges always have their countryCode,
 * region, and city overwritten with the authoritative geofeed values.
 *
 * Scheduled cron (every Monday 04:00 UTC):
 *   Refreshes the geofeed into KV so lookups stay current.
 */

import { loadRanges, lookupGeofeed, refreshGeofeed } from './geofeed';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Env {
  IPAPI_KEY: string;    // wrangler secret put IPAPI_KEY
  GEOFEED_URL: string;  // wrangler secret put GEOFEED_URL
  GEOFEED_KV: KVNamespace;
}

interface IpApiResult {
  query: string;
  status: 'success' | 'fail';
  message?: string;
  country?: string;
  countryCode?: string;
  region?: string;
  regionName?: string;
  city?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IPAPI_BATCH_URL = 'https://pro.ip-api.com/batch';
const BATCH_SIZE = 100;
// Fields returned when the caller doesn't specify.
// 'query' is always appended so we can match results back to input IPs.
const DEFAULT_FIELDS =
  'status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Ensure 'query' is always in the field list so results can be matched to IPs.
function normaliseFields(raw: string): string {
  const set = new Set(raw.split(',').map(f => f.trim()).filter(Boolean));
  set.add('query');
  set.add('status');
  return [...set].join(',');
}

async function batchLookup(
  ips: string[],
  fields: string,
  key: string,
): Promise<IpApiResult[]> {
  const body = ips.map(ip => ({ query: ip, fields }));
  const resp = await fetch(`${IPAPI_BATCH_URL}?key=${key}&fields=${fields}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`ip-api.com responded ${resp.status} ${resp.statusText}`);
  return resp.json<IpApiResult[]>();
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleLookup(request: Request, env: Env): Promise<Response> {
  let payload: { ips: unknown; fields?: unknown };
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { ips, fields: rawFields = DEFAULT_FIELDS } = payload;

  if (!Array.isArray(ips) || ips.length === 0) {
    return json({ error: '"ips" must be a non-empty array' }, 400);
  }
  if (ips.length > 10_000) {
    return json({ error: 'Maximum 10,000 IPs per request' }, 400);
  }
  if (typeof rawFields !== 'string') {
    return json({ error: '"fields" must be a comma-separated string' }, 400);
  }

  const fields = normaliseFields(rawFields);

  // Fan out ip-api.com batches and geofeed range load in parallel.
  let apiResults: IpApiResult[];
  let geoRanges: Awaited<ReturnType<typeof loadRanges>>;

  try {
    [apiResults, geoRanges] = await Promise.all([
      Promise.all(
        chunk(ips as string[], BATCH_SIZE).map(batch => batchLookup(batch, fields, env.IPAPI_KEY)),
      ).then(batches => batches.flat()),
      loadRanges(env.GEOFEED_KV),
    ]);
  } catch (err) {
    console.error(JSON.stringify({ event: 'lookup_error', detail: String(err) }));
    return json({ error: 'Failed to fetch IP data' }, 502);
  }

  // Apply geofeed overrides — our data takes priority over ip-api.com.
  const results = apiResults.map(result => {
    if (result.status !== 'success') return result;

    const override = lookupGeofeed(result.query, geoRanges);
    if (!override) return result;

    // Only fall back to ip-api's city/region when the country codes agree.
    // If they disagree, ip-api's city/region belongs to the wrong country,
    // so we use the geofeed's values (or leave empty if geofeed has none).
    const sameCountry = override.countryCode === result.countryCode;

    return {
      ...result,
      countryCode: override.countryCode,
      region: override.region || (sameCountry ? result.region : ''),
      regionName: sameCountry ? result.regionName : '',
      city: override.city || (sameCountry ? result.city : ''),
      _geofeed: true,
    };
  });

  return json({ results });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed. Send POST with { "ips": [...] }' }, 405);
    }
    return handleLookup(request, env);
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      refreshGeofeed(env.GEOFEED_URL, env.GEOFEED_KV)
        .then(count => {
          console.log(JSON.stringify({ event: 'geofeed_refreshed', ranges: count }));
        })
        .catch(err => {
          console.error(JSON.stringify({ event: 'geofeed_refresh_failed', detail: String(err) }));
        }),
    );
  },
} satisfies ExportedHandler<Env>;
