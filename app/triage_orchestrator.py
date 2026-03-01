"""
triage.py
Gemini-powered AI triage for WellWatch.

Given an API number, pulls the well's metadata + recent sensor readings
from Snowflake, sends them to Gemini, parses the structured response,
and inserts the result into AI_TRIAGE_RESULTS.

Usage (from main.py):
    from triage import run_triage
    result = run_triage(api_number)
"""

import json
import re
from google import genai
from datetime import datetime, timezone

from config import GEMINI_API_KEY
from db import fetch_dicts, execute

# ── How many recent readings to include in the prompt ──
READINGS_WINDOW = 20

# ── Configure Gemini ──
client = genai.Client(api_key=GEMINI_API_KEY)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DATA FETCHING
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def get_well_metadata(api_number: str) -> dict | None:
    rows = fetch_dicts(
        """
        SELECT API_NUMBER, WELL_NAME, WELL_STATUS, WELL_TYPE,
               FORMATION, DEPTH_FT, COUNTY, STATE,
               OPERATOR_LAST, SPUD_DATE, PLUG_DATE, EPA_RISK_BASELINE
        FROM WELLS
        WHERE API_NUMBER = %s
        LIMIT 1
        """,
        [api_number],
    )
    return rows[0] if rows else None


def get_recent_readings(api_number: str) -> list[dict]:
    return fetch_dicts(
        """
        SELECT TS, CH4_PPM, PRESSURE_PSI, TEMP_DELTA_C,
               SUBSIDENCE_MM, SIGNAL_STRENGTH, BATTERY_PCT,
               IS_DROPOUT, DROPOUT_REASON, DATA_QUALITY_FLAG
        FROM SENSOR_READINGS
        WHERE API_NUMBER = %s
        ORDER BY TS DESC
        LIMIT %s
        """,
        [api_number, READINGS_WINDOW],
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  PROMPT BUILDER
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def build_prompt(well: dict, readings: list[dict]) -> str:
    readings_text = "\n".join(
        f"  - {r['TS']} | CH4: {r['CH4_PPM']} ppm | Pressure: {r['PRESSURE_PSI']} psi | "
        f"Temp delta: {r['TEMP_DELTA_C']}°C | Subsidence: {r['SUBSIDENCE_MM']} mm | "
        f"Signal: {r['SIGNAL_STRENGTH']} | Battery: {r['BATTERY_PCT']}% | "
        f"Dropout: {r['IS_DROPOUT']} | Quality: {r['DATA_QUALITY_FLAG']}"
        for r in readings
    )

    return f"""
You are an expert environmental engineer specializing in abandoned and orphaned oil & gas wells.
Analyze the following well data and sensor readings to assess methane leak risk.

## WELL METADATA
- API Number: {well.get('API_NUMBER')}
- Name: {well.get('WELL_NAME')}
- Status: {well.get('WELL_STATUS')}
- Type: {well.get('WELL_TYPE')}
- Formation: {well.get('FORMATION')}
- Depth: {well.get('DEPTH_FT')} ft
- County: {well.get('COUNTY')}, {well.get('STATE')}
- Operator: {well.get('OPERATOR_LAST')}
- Spud Date: {well.get('SPUD_DATE')}
- Plug Date: {well.get('PLUG_DATE')}
- EPA Risk Baseline: {well.get('EPA_RISK_BASELINE')}

## RECENT SENSOR READINGS (most recent first)
{readings_text if readings_text else "  No readings available."}

## YOUR TASK
Based on the above data, return a JSON object with EXACTLY these fields (no extra commentary, just valid JSON):

{{
  "risk_score": <float 0-100>,
  "risk_category": <"CRITICAL" | "HIGH" | "MEDIUM" | "LOW">,
  "gemini_reasoning": "<2-3 sentence explanation of your assessment>",
  "recommended_action": "<one clear action for operators>",
  "capping_instructions": "<step-by-step capping procedure if needed, or null>",
  "immediate_actions": ["<action 1>", "<action 2>", ...],
  "estimated_repair_hrs": <float or null>,
  "crew_size_needed": <int or null>,
  "emit_ppb": <estimated methane emission in ppb as float or null>
}}

Risk score guidelines:
- 80-100: Active leak suspected, immediate intervention required
- 60-79: Elevated risk, schedule inspection within 48 hours
- 40-59: Moderate concern, monitor closely
- 0-39: Low risk, routine monitoring

Ambient methane is ~1.9 ppm. Readings above 5 ppm are concerning. Above 50 ppm is serious.
""".strip()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GEMINI CALL + PARSE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def call_gemini(prompt: str) -> dict:
    response = client.models.generate_content(
    model="models/gemini-2.5-flash",
    contents=prompt,
)
    text = response.text.strip()

    # Strip markdown code fences if Gemini wraps in ```json ... ```
    text = re.sub(r"^```json\s*", "", text)
    text = re.sub(r"\s*```$", "", text)

    return json.loads(text)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  SNOWFLAKE INSERT
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def insert_triage(api_number: str, result: dict) -> int:
    immediate_actions = json.dumps(result.get("immediate_actions") or [])

    execute(
        """
        INSERT INTO AI_TRIAGE_RESULTS (
            API_NUMBER, TS, RISK_SCORE, RISK_CATEGORY, GEMINI_REASONING,
            RECOMMENDED_ACTION, CAPPING_INSTRUCTIONS,
            ESTIMATED_REPAIR_HRS, CREW_SIZE_NEEDED, SATELLITE_CONFIRMED,
            EMIT_PPB, VOICE_BRIEF_URL
        ) VALUES (
            %s, CURRENT_TIMESTAMP, %s, %s, %s,
            %s, %s,
            %s, %s, FALSE,
            %s, NULL
        )
        """,
        [
            api_number,
            result.get("risk_score"),
            result.get("risk_category"),
            result.get("gemini_reasoning"),
            result.get("recommended_action"),
            result.get("capping_instructions"),
            result.get("estimated_repair_hrs"),
            result.get("crew_size_needed"),
            result.get("emit_ppb"),
        ],
    )

    # Update IMMEDIATE_ACTIONS separately using PARSE_JSON
    execute(
        """
        UPDATE AI_TRIAGE_RESULTS
        SET IMMEDIATE_ACTIONS = PARSE_JSON(%s)
        WHERE API_NUMBER = %s
        AND TS = (SELECT MAX(TS) FROM AI_TRIAGE_RESULTS WHERE API_NUMBER = %s)
        """,
        [immediate_actions, api_number, api_number],
    )

    rows = fetch_dicts(
        """
        SELECT TRIAGE_ID FROM AI_TRIAGE_RESULTS
        WHERE API_NUMBER = %s
        ORDER BY TS DESC
        LIMIT 1
        """,
        [api_number],
    )
    return rows[0]["TRIAGE_ID"] if rows else -1


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  PUBLIC ENTRY POINT
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def run_triage(api_number: str) -> dict:
    """
    Full triage pipeline for one well.
    Returns a dict matching the TriageOut shape (including triage_id and ts).
    Raises ValueError if the well doesn't exist.
    Raises RuntimeError if Gemini returns unparseable JSON.
    """
    # 1. Fetch data
    well = get_well_metadata(api_number)
    if well is None:
        raise ValueError(f"Well {api_number} not found in WELLS table.")

    readings = get_recent_readings(api_number)

    # 2. Build prompt and call Gemini
    prompt = build_prompt(well, readings)

    try:
        result = call_gemini(prompt)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Gemini returned invalid JSON: {e}")

    # 3. Persist to Snowflake
    triage_id = insert_triage(api_number, result)

    # 4. Return full shape matching TriageOut
    return {
        "triage_id": triage_id,
        "api_number": api_number,
        "ts": datetime.now(timezone.utc),
        "risk_score": result.get("risk_score"),
        "risk_category": result.get("risk_category"),
        "gemini_reasoning": result.get("gemini_reasoning"),
        "recommended_action": result.get("recommended_action"),
        "capping_instructions": result.get("capping_instructions"),
        "immediate_actions": result.get("immediate_actions"),
        "estimated_repair_hrs": result.get("estimated_repair_hrs"),
        "crew_size_needed": result.get("crew_size_needed"),
        "satellite_confirmed": False,
        "emit_ppb": result.get("emit_ppb"),
        "voice_brief_url": None,
    }