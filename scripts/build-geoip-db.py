#!/usr/bin/env python3
"""
build-geoip-db.py — Build geoip.mmdb from ipapi.is + geofeed sources.

Sources:
  1. ipapi.is IPv4 geolocation CSV (free, GitHub)
  2. ipapi.is IPv6 geolocation CSV (free, GitHub)
  3. Geofeed CSV from $GEOFEED_URL (authoritative, narrower ranges)

Output: geoip.mmdb (passed to mmdbctl import)

Exit codes:
  0 — success
  1 — any source failed to download or mmdbctl failed
"""

import csv
import io
import ipaddress
import os
import subprocess
import sys
import tempfile
import urllib.request
import zipfile

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

IPAPI_IPV4_URL = (
    "https://github.com/ipapi-is/ipapi/raw/main/databases/"
    "geolocationDatabaseIPv4.csv.zip"
)
IPAPI_IPV6_URL = (
    "https://github.com/ipapi-is/ipapi/raw/main/databases/"
    "geolocationDatabaseIPv6.csv.zip"
)

GEOFEED_URL = os.environ.get("GEOFEED_URL", "").strip()

# mmdbctl produces a merged MMDB from a CSV with startIp/endIp columns.
MMDB_OUT = os.environ.get("MMDB_OUT", "geoip.mmdb")

# ipapi.is CSV header (after the ip_version first column is stripped).
# Column names and count must stay in sync with the upstream CSV; verified
# against the live file on 2026-04-15.  The `source` column is retained so
# mmdbctl sees a consistent schema for both ipapi.is and geofeed rows.
IPAPI_HEADER = (
    "start_ip,end_ip,continent,country_code,country,state,city,"
    "zip,timezone,latitude,longitude,accuracy,source"
)

# Output header written once at the top of merged.csv.
# mmdbctl reads the first row as the column definitions.
MERGED_HEADER = IPAPI_HEADER

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def csv_row(*fields: str) -> str:
    """Serialize fields as a single CSV row with proper quoting."""
    buf = io.StringIO()
    csv.writer(buf).writerow(fields)
    return buf.getvalue().rstrip("\r\n")


def log(msg: str) -> None:
    print(f"[build-geoip] {msg}", flush=True)


def fail(msg: str) -> None:
    print(f"[build-geoip] ERROR: {msg}", file=sys.stderr, flush=True)
    sys.exit(1)


def download_bytes(url: str, user_agent: str = "build-geoip-db/1.0") -> bytes:
    """Download url and return raw bytes. Raises urllib.error.HTTPError on non-2xx."""
    req = urllib.request.Request(url, headers={"User-Agent": user_agent})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read()


def fetch_ipapi_csv(url: str, label: str) -> list[str]:
    """
    Download an ipapi.is zip, extract the single CSV inside, strip the first
    (ipVersion) column, and return lines WITHOUT a header row.
    """
    log(f"Downloading {label} …")
    raw = download_bytes(url)

    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        csv_names = [n for n in zf.namelist() if n.endswith(".csv")]
        if not csv_names:
            raise RuntimeError(f"No CSV found in {label} zip")
        csv_data = zf.read(csv_names[0]).decode("utf-8", errors="replace")

    lines = csv_data.splitlines()
    if not lines:
        raise RuntimeError(f"{label} CSV is empty")

    # Skip header row (ipVersion,startIp,endIp,…) and strip first column.
    out = []
    for line in lines[1:]:
        if not line.strip():
            continue
        # Remove the leading ipVersion field (4 or 6) by finding the first comma.
        comma = line.index(",")
        out.append(line[comma + 1:])

    log(f"  {len(out):,} rows from {label}")
    return out


def cidr_to_range(network: str) -> tuple[str, str]:
    """Convert a CIDR string to (startIp, endIp) strings."""
    net = ipaddress.ip_network(network, strict=False)
    return str(net.network_address), str(net.broadcast_address)


def fetch_geofeed(url: str) -> list[str]:
    """
    Download the geofeed CSV (RFC 8805, no header, CIDR notation) and convert
    each row to the merged schema:
      start_ip,end_ip,continent,country_code,country,state,city,zip,
      timezone,latitude,longitude,accuracy,source

    Geofeed columns: network,country_code,region_code,city,postal_code
    region_code is ISO 3166-2 like "US-VA" — we strip the country prefix.
    """
    log(f"Downloading geofeed from {url} …")
    # The server requires a browser-like User-Agent.
    raw = download_bytes(url, user_agent="Mozilla/5.0 (compatible; build-geoip-db)")
    text = raw.decode("utf-8", errors="replace")

    out = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue

        parts = line.split(",")
        if len(parts) < 4:
            continue

        network     = parts[0].strip()
        country_code = parts[1].strip()
        region_code = parts[2].strip()   # e.g. "US-VA"
        city        = parts[3].strip()

        # Strip country prefix from region_code: "US-VA" → "VA".
        if "-" in region_code:
            state = region_code.split("-", 1)[1]
        else:
            state = region_code

        try:
            start_ip, end_ip = cidr_to_range(network)
        except ValueError:
            continue  # skip malformed rows

        # Emit in MERGED_HEADER column order; leave unmapped fields empty.
        # accuracy=1 because geofeed data is authoritative for these ranges.
        # csv_row handles quoting so city/state values with commas are safe.
        out.append(csv_row(
            start_ip, end_ip,
            "",           # continent
            country_code,
            "",           # country full name
            state, city,
            "",           # zip
            "",           # timezone
            "",           # latitude
            "",           # longitude
            "1",          # accuracy
            "geofeed",    # source
        ))

    log(f"  {len(out):,} rows from geofeed")
    return out


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    if not GEOFEED_URL:
        fail("GEOFEED_URL environment variable is not set")

    # --- Fetch all sources (any failure exits 1) ---
    try:
        ipv4_rows = fetch_ipapi_csv(IPAPI_IPV4_URL, "IPv4")
    except Exception as e:
        fail(f"Failed to download IPv4 database: {e}")

    try:
        ipv6_rows = fetch_ipapi_csv(IPAPI_IPV6_URL, "IPv6")
    except Exception as e:
        fail(f"Failed to download IPv6 database: {e}")

    try:
        geofeed_rows = fetch_geofeed(GEOFEED_URL)
    except Exception as e:
        fail(f"Failed to download geofeed: {e}")

    total = len(ipv4_rows) + len(ipv6_rows) + len(geofeed_rows)
    log(f"Total rows: {total:,} ({len(ipv4_rows):,} IPv4 + {len(ipv6_rows):,} IPv6 + {len(geofeed_rows):,} geofeed)")

    # --- Write merged CSV to a temp file ---
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".csv", delete=False, encoding="utf-8"
    ) as tmp:
        tmp_path = tmp.name
        tmp.write(MERGED_HEADER + "\n")
        # ipapi.is rows first (broad coverage), geofeed rows last so their
        # narrower/more-specific ranges win via MMDB most-specific-match.
        for row in ipv4_rows:
            tmp.write(row + "\n")
        for row in ipv6_rows:
            tmp.write(row + "\n")
        for row in geofeed_rows:
            tmp.write(row + "\n")

    log(f"Merged CSV written to {tmp_path}")

    # --- Run mmdbctl import ---
    log(f"Running mmdbctl import → {MMDB_OUT} …")
    result = subprocess.run(
        ["mmdbctl", "import", "--in", tmp_path, "--out", MMDB_OUT],
        capture_output=False,
    )

    os.unlink(tmp_path)

    if result.returncode != 0:
        fail(f"mmdbctl exited with code {result.returncode}")

    log(f"Done → {MMDB_OUT}")


if __name__ == "__main__":
    main()
