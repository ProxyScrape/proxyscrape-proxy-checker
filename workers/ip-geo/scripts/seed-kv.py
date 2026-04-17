#!/usr/bin/env python3
"""
seed-kv.py — Fetch geofeed, parse into StoredRanges JSON, write to a file,
then upload to Cloudflare KV via wrangler.

Usage:
  GEOFEED_URL="https://..." KV_NAMESPACE_ID="..." python3 scripts/seed-kv.py

Both env vars are required.
"""

import ipaddress
import json
import os
import subprocess
import sys
import tempfile
import urllib.request

GEOFEED_URL      = os.environ.get("GEOFEED_URL", "").strip()
KV_NAMESPACE_ID  = os.environ.get("KV_NAMESPACE_ID", "").strip()
KV_KEY           = "ranges:v1"


def fail(msg: str) -> None:
    print(f"[seed-kv] ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def log(msg: str) -> None:
    print(f"[seed-kv] {msg}", flush=True)


def fetch_geofeed(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "seed-kv/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def parse(text: str) -> dict:
    v4, v6 = [], []

    for raw in text.splitlines():
        line = raw.split("#")[0].strip()
        if not line:
            continue

        parts = line.split(",")
        if len(parts) < 2:
            continue

        network     = parts[0].strip()
        cc          = parts[1].strip()
        region_full = parts[2].strip() if len(parts) > 2 else ""
        city        = parts[3].strip() if len(parts) > 3 else ""

        if not network or not cc:
            continue

        # "US-VA" → "VA"
        rc = region_full.split("-", 1)[1] if "-" in region_full else region_full

        try:
            net   = ipaddress.ip_network(network, strict=False)
            start = int(net.network_address)
            end   = int(net.broadcast_address)
        except ValueError:
            continue

        entry = {"s": start, "e": end, "cc": cc, "rc": rc, "ci": city}

        if net.version == 4:
            v4.append(entry)
        else:
            # Store BigInt as decimal string (matches TypeScript BigInt(str))
            v6.append({**entry, "s": str(start), "e": str(end)})

    v4.sort(key=lambda r: r["s"])
    v6.sort(key=lambda r: int(r["s"]))

    return {"v4": v4, "v6": v6}


def main() -> None:
    if not GEOFEED_URL:
        fail("GEOFEED_URL environment variable is not set")
    if not KV_NAMESPACE_ID:
        fail("KV_NAMESPACE_ID environment variable is not set")

    log(f"Fetching geofeed from {GEOFEED_URL} …")
    text   = fetch_geofeed(GEOFEED_URL)
    ranges = parse(text)
    log(f"Parsed {len(ranges['v4']):,} IPv4 + {len(ranges['v6']):,} IPv6 ranges")

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", delete=False, encoding="utf-8"
    ) as tmp:
        json.dump(ranges, tmp)
        tmp_path = tmp.name

    log(f"Uploading to KV namespace {KV_NAMESPACE_ID} key '{KV_KEY}' …")
    result = subprocess.run(
        [
            "npx", "wrangler", "kv", "key", "put",
            "--namespace-id", KV_NAMESPACE_ID,
            "--remote",
            KV_KEY,
            "--path", tmp_path,
        ],
        capture_output=False,
    )

    os.unlink(tmp_path)

    if result.returncode != 0:
        fail(f"wrangler kv key put failed with code {result.returncode}")

    log("Done — KV seeded successfully.")


if __name__ == "__main__":
    main()
