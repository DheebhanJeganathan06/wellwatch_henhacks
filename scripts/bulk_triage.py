"""
bulk_triage.py
Runs AI triage on all wells in the database.

Usage:
    cd wellwatch_henhacks
    venv\\Scripts\\activate
    python scripts/bulk_triage.py
"""

import sys
import os
import time
import requests

# ── Config ──
API_BASE = "http://127.0.0.1:8000"
DELAY_SEC = 1.5  # pause between calls to avoid rate limits

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app"))
from db import fetch_all

def main():
    print("Loading wells from Snowflake...")
    rows = fetch_all("SELECT API_NUMBER FROM WELLS ORDER BY API_NUMBER")
    api_numbers = [row[0] for row in rows]
    print(f"Found {len(api_numbers)} wells. Starting triage...\n")

    success, failed = 0, []

    for i, api in enumerate(api_numbers, 1):
        print(f"[{i}/{len(api_numbers)}] Triaging {api}...", end=" ", flush=True)
        try:
            r = requests.post(f"{API_BASE}/triage/{api}", timeout=30)
            if r.status_code == 200:
                data = r.json()
                print(f"✓ {data['risk_category']} ({data['risk_score']})")
                success += 1
            else:
                print(f"✗ HTTP {r.status_code}: {r.text[:100]}")
                failed.append(api)
        except Exception as e:
            print(f"✗ ERROR: {e}")
            failed.append(api)

        time.sleep(DELAY_SEC)

    print(f"\n{'='*50}")
    print(f"Done! {success}/{len(api_numbers)} wells triaged successfully.")
    if failed:
        print(f"Failed: {failed}")

if __name__ == "__main__":
    main()