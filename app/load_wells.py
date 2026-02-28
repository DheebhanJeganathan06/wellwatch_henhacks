"""
load_wells.py
Loads exactly 1,000 wells from the PA DEP GeoJSON into Snowflake.

Usage:
    cd app
    python load_wells.py
"""

import json
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db import execute_many, fetch_dicts, get_cursor

# ── HOW MANY WELLS TO LOAD (total, not per batch) ──
MAX_WELLS = 1000

# ── Path to the GeoJSON file ──
GEOJSON_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..",
    "data",
    "pa_dep_wells.geojson",
)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  HELPERS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def clean(value):
    """Strip whitespace, convert blank strings to None."""
    if value is None:
        return None
    s = str(value).strip()
    return s if s else None


def to_date(epoch_ms):
    """Convert epoch milliseconds to a date. Handles pre-1970 negative values."""
    if epoch_ms is None:
        return None
    try:
        dt = datetime(1970, 1, 1, tzinfo=timezone.utc) + timedelta(seconds=epoch_ms / 1000.0)
        return dt.date()
    except (ValueError, OverflowError):
        return None


def to_float(value):
    """Convert to float, return None if not a number."""
    c = clean(value)
    if c is None:
        return None
    try:
        return float(c)
    except (ValueError, TypeError):
        return None


def formation(attrs):
    """Return the first non-empty formation field, or None."""
    for key in ["TARGET_FOR", "OLDEST_FOR", "PRODUCING_"]:
        v = clean(attrs.get(key))
        if v:
            return v
    return None


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  PARSE ONE FEATURE INTO A ROW
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def parse(feature):
    """
    Convert one GeoJSON feature into a tuple for INSERT.
    Returns None if permit number is missing.
    """
    a = feature.get("attributes", {})

    api = clean(a.get("PERMIT_NUM"))
    if not api:
        return None

    return (
        api,                                # API_NUMBER
        to_float(a.get("LATITUDE")),        # LAT
        to_float(a.get("LONGITUDE")),       # LON
        "PA",                               # STATE
        clean(a.get("COUNTY")),             # COUNTY
        clean(a.get("MUNICIPALI")),         # MUNICIPALITY
        clean(a.get("WELL_NAME")),          # WELL_NAME
        clean(a.get("WELL_STATU")),         # WELL_STATUS
        clean(a.get("WELL_TYPE")),          # WELL_TYPE
        formation(a),                       # FORMATION
        to_float(a.get("TOTAL_MAXI")),      # DEPTH_FT
        to_date(a.get("DATE_PLUGG")),       # PLUG_DATE
        to_date(a.get("SPUD_DATE")),        # SPUD_DATE
        clean(a.get("OPERATOR")),           # OPERATOR_LAST
        None,                               # EPA_RISK_BASELINE (filled later)
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  MAIN
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def main():
    # ── 1. Read file ──
    path = os.path.normpath(GEOJSON_PATH)
    print(f"Reading: {path}")

    if not os.path.exists(path):
        print(f"ERROR: File not found at {path}")
        sys.exit(1)

    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    features = data.get("features", [])
    print(f"Total features in file: {len(features):,}")

    # ── 2. Parse features, stop at MAX_WELLS ──
    rows = []
    seen = set()
    skipped = 0

    for feature in features:
        # Stop once we have enough
        if len(rows) >= MAX_WELLS:
            break

        row = parse(feature)
        if row is None:
            skipped += 1
            continue

        # Skip duplicates
        api = row[0]
        if api in seen:
            skipped += 1
            continue
        seen.add(api)

        rows.append(row)

    print(f"Parsed {len(rows):,} wells (skipped {skipped:,}).")

    if not rows:
        print("No rows to insert.")
        sys.exit(1)

    # ── 3. Clear table and insert ──
    print("Clearing WELLS table...")
    with get_cursor() as cur:
        cur.execute("TRUNCATE TABLE IF EXISTS WELLS")

    print(f"Inserting {len(rows):,} wells into Snowflake...")
    execute_many(
        """
        INSERT INTO WELLS (
            API_NUMBER, LAT, LON, STATE, COUNTY, MUNICIPALITY,
            WELL_NAME, WELL_STATUS, WELL_TYPE, FORMATION, DEPTH_FT,
            PLUG_DATE, SPUD_DATE, OPERATOR_LAST, EPA_RISK_BASELINE
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        rows,
    )
    print(f"Inserted {len(rows):,} wells.")

    # ── 4. Backfill GEOMETRY ──
    print("Backfilling GEOMETRY...")
    with get_cursor() as cur:
        cur.execute("""
            UPDATE WELLS
            SET GEOMETRY = ST_MAKEPOINT(LON, LAT)
            WHERE LAT IS NOT NULL AND LON IS NOT NULL
        """)
        print(f"Updated GEOMETRY for {cur.rowcount:,} wells.")

    # ── 5. Summary ──
    summary = fetch_dicts("SELECT COUNT(*) AS cnt FROM WELLS")[0]
    print(f"\nDone! WELLS table now has {summary['CNT']:,} rows.")


if __name__ == "__main__":
    main()