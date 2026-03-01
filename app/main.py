"""
main.py
WellWatch FastAPI application.

Endpoints:
    GET  /health                        — liveness check
    GET  /wells/map                     — all wells + latest triage for map layer  ← NEW
    GET  /wells                         — list all wells (metadata only)
    GET  /wells/{api_number}            — single well detail
    GET  /wells/{api_number}/readings   — recent sensor readings for charts        ← NEW
    POST /triage/{api_number}           — run Gemini AI triage on a well
    GET  /alerts                        — wells with risk_score >= 80
    GET  /dashboard/stats               — aggregate dashboard numbers
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date

from models import WellOut, TriageOut, AlertOut, DashboardStats, SensorReadingOut
from db import fetch_dicts
from triage_orchestrator import run_triage

app = FastAPI(
    title="WellWatch API",
    description="Methane leak detection and AI triage for abandoned oil & gas wells.",
    version="0.2.0",
)

# Allow the Next.js dev server and any production domain to call the API.
# In production, replace ["*"] with your actual frontend origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  HEALTH
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/health")
def health():
    return {"status": "ok"}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  MAP ENDPOINT  (must be declared before /wells/{api_number})
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class WellMapItem(BaseModel):
    """Well record enriched with its latest triage result — used by the map layer."""
    api_number: str
    lat: Optional[float] = None
    lon: Optional[float] = None
    well_name: Optional[str] = None
    county: Optional[str] = None
    state: Optional[str] = None
    well_status: Optional[str] = None
    well_type: Optional[str] = None
    formation: Optional[str] = None
    depth_ft: Optional[float] = None
    plug_date: Optional[date] = None
    spud_date: Optional[date] = None
    operator_last: Optional[str] = None
    # Triage fields (None if no triage has been run yet)
    risk_score: Optional[float] = None
    risk_category: Optional[str] = None
    gemini_reasoning: Optional[str] = None
    recommended_action: Optional[str] = None
    crew_size_needed: Optional[int] = None
    estimated_repair_hrs: Optional[float] = None
    satellite_confirmed: Optional[bool] = None
    emit_ppb: Optional[float] = None
    triage_ts: Optional[datetime] = None


@app.get("/wells/map", response_model=list[WellMapItem])
def get_wells_map():
    """
    Return every well that has coordinates, joined with its most recent triage
    result (LEFT JOIN — wells without triage are included with null risk fields).

    This single call replaces separate /wells + /triage fetches on the frontend,
    which would create an N+1 query problem for 1000 wells.

    Sorted high-risk first so the frontend can skip sorting.
    """
    rows = fetch_dicts(
        """
        SELECT
            w.API_NUMBER,
            w.LAT,
            w.LON,
            w.WELL_NAME,
            w.COUNTY,
            w.STATE,
            w.WELL_STATUS,
            w.WELL_TYPE,
            w.FORMATION,
            w.DEPTH_FT,
            w.PLUG_DATE,
            w.SPUD_DATE,
            w.OPERATOR_LAST,
            t.RISK_SCORE,
            t.RISK_CATEGORY,
            t.GEMINI_REASONING,
            t.RECOMMENDED_ACTION,
            t.CREW_SIZE_NEEDED,
            t.ESTIMATED_REPAIR_HRS,
            t.SATELLITE_CONFIRMED,
            t.EMIT_PPB,
            t.TS AS TRIAGE_TS
        FROM WELLS w
        LEFT JOIN (
            SELECT *,
                ROW_NUMBER() OVER (
                    PARTITION BY API_NUMBER
                    ORDER BY TS DESC
                ) AS rn
            FROM AI_TRIAGE_RESULTS
        ) t ON t.API_NUMBER = w.API_NUMBER AND t.rn = 1
        WHERE w.LAT IS NOT NULL
          AND w.LON  IS NOT NULL
        ORDER BY COALESCE(t.RISK_SCORE, 0) DESC
        LIMIT 1000
        """
    )
    return [_lower(r) for r in rows]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  WELLS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/wells", response_model=list[WellOut])
def get_wells():
    """Return all wells (capped at 1000)."""
    rows = fetch_dicts(
        """
        SELECT SURROGATE_ID, API_NUMBER, LAT, LON, STATE, COUNTY,
               MUNICIPALITY, WELL_NAME, WELL_STATUS, WELL_TYPE,
               FORMATION, DEPTH_FT, PLUG_DATE, SPUD_DATE,
               OPERATOR_LAST, EPA_RISK_BASELINE
        FROM WELLS
        ORDER BY API_NUMBER
        LIMIT 1000
        """
    )
    return [_lower(r) for r in rows]


@app.get("/wells/{api_number}/readings", response_model=list[SensorReadingOut])
def get_well_readings(
    api_number: str,
    limit: int = Query(default=24, ge=1, le=200, description="Number of most-recent readings to return"),
):
    """
    Return the most recent sensor readings for a well, oldest-first so the
    frontend can pass the list directly to a time-series chart.

    Dropouts are included so the chart can show signal-loss gaps.
    """
    rows = fetch_dicts(
        """
        SELECT
            READING_ID, API_NUMBER, TS,
            CH4_PPM, PRESSURE_PSI, TEMP_DELTA_C,
            SUBSIDENCE_MM, SIGNAL_STRENGTH, BATTERY_PCT,
            IS_DROPOUT, DROPOUT_REASON, DATA_QUALITY_FLAG
        FROM SENSOR_READINGS
        WHERE API_NUMBER = %s
        ORDER BY TS DESC
        LIMIT %s
        """,
        [api_number, limit],
    )
    # Reverse so the frontend receives oldest → newest (natural chart order)
    return [_lower(r) for r in reversed(rows)]


@app.get("/wells/{api_number}", response_model=WellOut)
def get_well(api_number: str):
    """Return a single well by API number."""
    rows = fetch_dicts(
        """
        SELECT SURROGATE_ID, API_NUMBER, LAT, LON, STATE, COUNTY,
               MUNICIPALITY, WELL_NAME, WELL_STATUS, WELL_TYPE,
               FORMATION, DEPTH_FT, PLUG_DATE, SPUD_DATE,
               OPERATOR_LAST, EPA_RISK_BASELINE
        FROM WELLS
        WHERE API_NUMBER = %s
        LIMIT 1
        """,
        [api_number],
    )
    if not rows:
        raise HTTPException(status_code=404, detail=f"Well {api_number} not found.")
    return _lower(rows[0])


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  TRIAGE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.post("/triage/{api_number}", response_model=TriageOut)
def triage(api_number: str):
    """
    Run Gemini AI triage on a well.
    Pulls recent sensor readings, calls Gemini, stores result,
    and returns the full triage assessment.
    """
    try:
        result = run_triage(api_number)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return result


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ALERTS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/alerts", response_model=list[AlertOut])
def get_alerts():
    """
    Return all wells whose latest triage risk_score >= 80,
    joined with their most recent CH4 reading.
    """
    rows = fetch_dicts(
        """
        WITH latest_triage AS (
            SELECT
                API_NUMBER,
                RISK_SCORE,
                RISK_CATEGORY,
                RECOMMENDED_ACTION,
                TS,
                ROW_NUMBER() OVER (PARTITION BY API_NUMBER ORDER BY TS DESC) AS rn
            FROM AI_TRIAGE_RESULTS
            WHERE RISK_SCORE >= 80
        ),
        latest_ch4 AS (
            SELECT
                API_NUMBER,
                CH4_PPM,
                ROW_NUMBER() OVER (PARTITION BY API_NUMBER ORDER BY TS DESC) AS rn
            FROM SENSOR_READINGS
            WHERE CH4_PPM IS NOT NULL
        )
        SELECT
            w.API_NUMBER,
            w.WELL_NAME,
            w.LAT,
            w.LON,
            t.RISK_SCORE,
            t.RISK_CATEGORY,
            t.RECOMMENDED_ACTION,
            s.CH4_PPM   AS LATEST_CH4_PPM,
            t.TS        AS TRIAGE_TS
        FROM WELLS w
        JOIN latest_triage t ON t.API_NUMBER = w.API_NUMBER AND t.rn = 1
        LEFT JOIN latest_ch4 s ON s.API_NUMBER = w.API_NUMBER AND s.rn = 1
        ORDER BY t.RISK_SCORE DESC
        """
    )
    return [_lower(r) for r in rows]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DASHBOARD STATS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/dashboard/stats", response_model=DashboardStats)
def dashboard_stats():
    """Aggregate numbers for the dashboard header."""
    rows = fetch_dicts(
        """
        SELECT
            (SELECT COUNT(*) FROM WELLS) AS TOTAL_WELLS,

            (SELECT COUNT(DISTINCT API_NUMBER)
             FROM SENSOR_READINGS) AS WELLS_WITH_READINGS,

            (SELECT COUNT(DISTINCT t.API_NUMBER)
             FROM AI_TRIAGE_RESULTS t
             INNER JOIN (
                 SELECT API_NUMBER, MAX(TS) AS max_ts
                 FROM AI_TRIAGE_RESULTS
                 GROUP BY API_NUMBER
             ) latest ON t.API_NUMBER = latest.API_NUMBER AND t.TS = latest.max_ts
             WHERE t.RISK_SCORE >= 80
            ) AS ACTIVE_ALERTS,

            (SELECT AVG(t.RISK_SCORE)
             FROM AI_TRIAGE_RESULTS t
             INNER JOIN (
                 SELECT API_NUMBER, MAX(TS) AS max_ts
                 FROM AI_TRIAGE_RESULTS
                 GROUP BY API_NUMBER
             ) latest ON t.API_NUMBER = latest.API_NUMBER AND t.TS = latest.max_ts
            ) AS AVG_RISK_SCORE,

            (SELECT SUM(GREATEST(CH4_PPM - 1.9, 0))
             FROM SENSOR_READINGS
             WHERE DATA_QUALITY_FLAG = 'OK'
            ) AS TOTAL_METHANE_DEBT_PPM
        """
    )
    r = _lower(rows[0])
    return {
        "total_wells":          r["total_wells"] or 0,
        "wells_with_readings":  r["wells_with_readings"] or 0,
        "active_alerts":        r["active_alerts"] or 0,
        "avg_risk_score":       r["avg_risk_score"],
        "total_methane_debt_ppm": r["total_methane_debt_ppm"],
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  HELPERS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _lower(d: dict) -> dict:
    """Snowflake returns uppercase keys; Pydantic expects lowercase."""
    return {k.lower(): v for k, v in d.items()}
