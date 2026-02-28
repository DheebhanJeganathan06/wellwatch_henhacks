"""
models.py
Pydantic models for WellWatch.

These serve three purposes:
  1. Validate incoming request bodies (e.g., POST /triage)
  2. Serialize outgoing API responses with consistent field names
  3. Auto-generate OpenAPI docs at /docs

Naming convention:
  - *Base   = shared fields (no IDs or server-generated values)
  - *Create = request body for creating a record
  - *Out    = response body (includes IDs and computed fields)
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  WELLS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class WellBase(BaseModel):
    api_number: str = Field(..., max_length=20, description="Unique API well identifier")
    lat: Optional[float] = None
    lon: Optional[float] = None
    state: Optional[str] = Field(None, max_length=2)
    county: Optional[str] = Field(None, max_length=100)
    municipality: Optional[str] = Field(None, max_length=100)
    well_name: Optional[str] = Field(None, max_length=200)
    well_status: Optional[str] = Field(None, max_length=50)
    well_type: Optional[str] = Field(None, max_length=50)
    formation: Optional[str] = Field(None, max_length=100)
    depth_ft: Optional[float] = None
    plug_date: Optional[date] = None
    spud_date: Optional[date] = None
    operator_last: Optional[str] = Field(None, max_length=200)
    epa_risk_baseline: Optional[float] = None


class WellCreate(WellBase):
    """Request body for inserting a well. SURROGATE_ID and GEOMETRY are handled server-side."""
    pass


class WellOut(WellBase):
    """Response body for a well record."""
    surrogate_id: int

    class Config:
        from_attributes = True


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  SENSOR_READINGS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class SensorReadingBase(BaseModel):
    api_number: str = Field(..., max_length=20)
    ts: datetime
    ch4_ppm: Optional[float] = None
    pressure_psi: Optional[float] = None
    temp_delta_c: Optional[float] = None
    subsidence_mm: Optional[float] = None
    signal_strength: Optional[float] = None
    battery_pct: Optional[float] = None
    is_dropout: bool = False
    dropout_reason: Optional[str] = Field(None, max_length=100)
    data_quality_flag: Optional[str] = Field("OK", max_length=20)


class SensorReadingCreate(SensorReadingBase):
    """Request body for inserting a reading. READING_ID is auto-generated."""
    pass


class SensorReadingOut(SensorReadingBase):
    """Response body for a sensor reading."""
    reading_id: int

    class Config:
        from_attributes = True


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  AI_TRIAGE_RESULTS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class TriageBase(BaseModel):
    api_number: str = Field(..., max_length=20)
    risk_score: Optional[float] = Field(None, ge=0, le=100)
    risk_category: Optional[str] = Field(None, max_length=50)
    gemini_reasoning: Optional[str] = None
    recommended_action: Optional[str] = None
    capping_instructions: Optional[str] = None
    immediate_actions: Optional[list] = None  # stored as VARIANT in Snowflake
    estimated_repair_hrs: Optional[float] = None
    crew_size_needed: Optional[int] = None
    satellite_confirmed: bool = False
    emit_ppb: Optional[float] = None
    voice_brief_url: Optional[str] = Field(None, max_length=500)


class TriageCreate(TriageBase):
    """Request body for inserting a triage result. TRIAGE_ID and TS are auto-generated."""
    pass


class TriageOut(TriageBase):
    """Response body for a triage result."""
    triage_id: int
    ts: datetime

    class Config:
        from_attributes = True


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DASHBOARD / AGGREGATE MODELS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class DashboardStats(BaseModel):
    """Response body for GET /dashboard/stats."""
    total_wells: int
    wells_with_readings: int
    active_alerts: int  # wells with risk_score >= 80
    avg_risk_score: Optional[float] = None
    total_methane_debt_ppm: Optional[float] = None  # sum of CH4 above ambient


class AlertOut(BaseModel):
    """Response body for GET /alerts — a high-risk well with its latest triage info."""
    api_number: str
    well_name: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    risk_score: Optional[float] = None
    risk_category: Optional[str] = None
    recommended_action: Optional[str] = None
    latest_ch4_ppm: Optional[float] = None
    triage_ts: Optional[datetime] = None