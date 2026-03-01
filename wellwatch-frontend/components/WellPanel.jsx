'use client';


import { useState, useEffect } from 'react';
import { fetchWellReadings, triggerTriage } from '@/lib/api';


const MONO = 'var(--font-mono)';


const RISK_VARS = {
  CRITICAL: { color: 'var(--risk-critical)', bg: 'var(--risk-critical-light)', border: 'var(--risk-critical-border)' },
  HIGH:     { color: 'var(--risk-high)',     bg: 'var(--risk-high-light)',     border: 'var(--risk-high-border)' },
  MEDIUM:   { color: 'var(--risk-medium)',   bg: 'var(--risk-medium-light)',   border: 'var(--risk-medium-border)' },
  LOW:      { color: 'var(--risk-low)',      bg: 'var(--risk-low-light)',      border: 'var(--risk-low-border)' },
  MINIMAL:  { color: 'var(--risk-minimal)',  bg: 'var(--risk-minimal-light)',  border: 'var(--risk-minimal-border)' },
  UNKNOWN:  { color: 'var(--risk-unknown)',  bg: 'var(--risk-unknown-light)',  border: 'var(--risk-unknown-border)' },
};


function getRisk(cat) { return RISK_VARS[cat] || RISK_VARS.UNKNOWN; }


function Sparkline({ data, color, height = 40 }) {
  if (!data || data.length < 2) return (
    <div style={{ height, display: 'flex', alignItems: 'center', color: 'var(--text-3)', fontFamily: MONO, fontSize: 10 }}>No data</div>
  );
  const w = 320, h = height, mn = Math.min(...data), mx = Math.max(...data), range = mx - mn || 1, pad = 4;
  const pts = data.map((v, i) => `${(pad + (i / (data.length - 1)) * (w - pad * 2)).toFixed(1)},${(pad + ((mx - v) / range) * (h - pad * 2)).toFixed(1)}`).join(' ');
  const area = `${pad},${h - pad} ${data.map((v, i) => `${(pad + (i / (data.length - 1)) * (w - pad * 2)).toFixed(1)},${(pad + ((mx - v) / range) * (h - pad * 2)).toFixed(1)}`).join(' ')} ${w - pad},${h - pad}`;
  const gid = `g${color.replace(/[^a-z0-9]/gi,'')}`;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.15"/><stop offset="100%" stopColor={color} stopOpacity="0.02"/></linearGradient></defs>
      <polygon points={area} fill={`url(#${gid})`}/>
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={pts}/>
    </svg>
  );
}


function MetaRow({ label, value }) {
  if (value == null || value === '') return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)' }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-1)', fontWeight: 500 }}>{value}</div>
    </div>
  );
}


function Card({ children, style }) {
  return <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius)', padding: '12px 14px', ...style }}>{children}</div>;
}


function SectionLabel({ children }) {
  return <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 10 }}>{children}</div>;
}


export default function WellPanel({ well, onClose, onTriageComplete }) {
  const [readings, setReadings]         = useState([]);
  const [triaging, setTriaging]         = useState(false);
  const [triageResult, setTriageResult] = useState(null);
  const [triageError, setTriageError]   = useState(null);
  const [dispatched, setDispatched]     = useState(false);


  const apiNumber = well?.api_number;


  useEffect(() => {
    if (!apiNumber) return;
    setReadings([]); setTriageResult(null); setDispatched(false);
    fetchWellReadings(apiNumber, 24)
      .then(data => setReadings(Array.isArray(data) ? data.reverse() : []))
      .catch(() => setReadings([]));
  }, [apiNumber]);


  if (!well) return null;


  const risk         = getRisk(well.risk_category);
  const displayRisk  = triageResult ? getRisk(triageResult.risk_category) : risk;
  const riskScore    = triageResult?.risk_score    ?? well.risk_score;
  const riskCat      = triageResult?.risk_category ?? well.risk_category;
  const reasoning    = triageResult?.gemini_reasoning  ?? well.gemini_reasoning;
  const recAction    = triageResult?.recommended_action ?? well.recommended_action;
  const crewSize     = triageResult?.crew_size_needed    ?? well.crew_size_needed;
  const repairHrs    = triageResult?.estimated_repair_hrs ?? well.estimated_repair_hrs;


  const ch4Data      = readings.filter(r => !r.is_dropout && r.ch4_ppm != null).map(r => r.ch4_ppm);
  const pressureData = readings.filter(r => !r.is_dropout && r.pressure_psi != null).map(r => r.pressure_psi);
  const latestCh4      = ch4Data.length      ? ch4Data[ch4Data.length - 1]           : null;
  const latestPressure = pressureData.length ? pressureData[pressureData.length - 1] : null;


  async function handleRunTriage() {
    setTriaging(true); setTriageError(null);
    try {
      const result = await triggerTriage(well.api_number);
      setTriageResult(result);
      if (onTriageComplete) onTriageComplete(well.api_number, result);
    } catch (e) {
      setTriageError(e.message);
    } finally {
      setTriaging(false);
    }
  }


  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', animation: 'slide-in 0.22s ease' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, borderLeft: `3px solid ${displayRisk.color}` }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{well.well_name || 'Unnamed Well'}</div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.06em' }}>{well.api_number}{well.county && ` · ${well.county} Co.`}{well.state && `, ${well.state}`}</div>
        </div>
        <button onClick={onClose} style={{ width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 18, flexShrink: 0, cursor: 'pointer', background: 'none', border: 'none' }}>×</button>
      </div>


      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>


        {/* Risk score */}
        <Card style={{ background: displayRisk.bg, border: `1px solid ${displayRisk.border}`, textAlign: 'center', padding: 16 }}>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 4 }}>Gemini Risk Score</div>
          {riskScore != null ? (
            <>
              <div style={{ fontFamily: MONO, fontSize: 52, fontWeight: 500, color: displayRisk.color, lineHeight: 1, marginBottom: 6 }}>{Math.round(riskScore)}</div>
              <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: displayRisk.color, background: displayRisk.bg, border: `1px solid ${displayRisk.border}`, borderRadius: 4, padding: '2px 8px' }}>{riskCat}</span>
            </>
          ) : (
            <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-3)', padding: '8px 0' }}>No triage yet — run Gemini below</div>
          )}
        </Card>


        {/* Sensors */}
        {readings.length > 0 && (
          <Card>
            <SectionLabel>Live Sensors · last {readings.length} readings</SectionLabel>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px' }}>
                <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-3)', marginBottom: 2 }}>CH₄</div>
                <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 500, color: '#92400E' }}>{latestCh4?.toFixed(1) ?? '—'}<span style={{ fontSize: 9, color: 'var(--text-3)', marginLeft: 3 }}>ppm</span></div>
              </div>
              <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px' }}>
                <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-3)', marginBottom: 2 }}>Pressure</div>
                <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 500, color: '#1E3A5F' }}>{latestPressure?.toFixed(1) ?? '—'}<span style={{ fontSize: 9, color: 'var(--text-3)', marginLeft: 3 }}>psi</span></div>
              </div>
            </div>
            {ch4Data.length > 1 && <><div style={{ fontFamily: MONO, fontSize: 9, color: '#92400E', marginBottom: 3 }}>CH₄ PPM TREND</div><Sparkline data={ch4Data} color="#C2410C" /></>}
            {pressureData.length > 1 && <><div style={{ fontFamily: MONO, fontSize: 9, color: '#1E3A5F', marginBottom: 3, marginTop: 10 }}>PRESSURE PSI</div><Sparkline data={pressureData} color="#1D4ED8" /></>}
          </Card>
        )}


        {/* AI reasoning */}
        {reasoning && (
          <Card style={{ background: '#F5F3FF', border: '1px solid #DDD6FE' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span>⚡</span>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7C3AED' }}>Gemini AI Insight</div>
            </div>
            <p style={{ fontSize: 12, color: '#4C1D95', lineHeight: 1.65 }}>{reasoning}</p>
            {recAction && (
              <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(124,58,237,0.08)', borderRadius: 6, borderLeft: '2px solid #7C3AED' }}>
                <div style={{ fontFamily: MONO, fontSize: 9, color: '#7C3AED', marginBottom: 3 }}>RECOMMENDED ACTION</div>
                <div style={{ fontSize: 12, color: '#4C1D95' }}>{recAction}</div>
              </div>
            )}
          </Card>
        )}


        {/* Metadata */}
        <Card>
          <SectionLabel>Well Metadata</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
            <MetaRow label="Status"    value={well.well_status} />
            <MetaRow label="Type"      value={well.well_type} />
            <MetaRow label="Formation" value={well.formation} />
            <MetaRow label="Depth"     value={well.depth_ft != null ? `${well.depth_ft.toLocaleString()} ft` : null} />
            <MetaRow label="Operator"  value={well.operator_last} />
            <MetaRow label="Spud Date" value={well.spud_date} />
            <MetaRow label="Plug Date" value={well.plug_date ?? 'Not plugged'} />
            <MetaRow label="Coords"    value={well.lat && well.lon ? `${well.lat.toFixed(4)}, ${well.lon.toFixed(4)}` : null} />
          </div>
        </Card>


        {/* Triage button */}
        <button onClick={handleRunTriage} disabled={triaging} style={{ width: '100%', padding: '11px 16px', background: triaging ? 'var(--surface-2)' : 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 12, fontWeight: 600, fontFamily: MONO, letterSpacing: '0.08em', color: triaging ? 'var(--text-3)' : 'var(--text-1)', cursor: triaging ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
          {triaging ? '⏳ Running AI Triage…' : '⚡ Run Gemini Triage'}
        </button>


        {triageError && <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--risk-critical)', background: 'var(--risk-critical-light)', border: '1px solid var(--risk-critical-border)', borderRadius: 6, padding: '8px 10px' }}>{triageError}</div>}


        {/* Crew dispatch */}
        {(crewSize || repairHrs) && (
          <Card>
            <SectionLabel>Crew Dispatch</SectionLabel>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {crewSize && <div style={{ flex: 1, textAlign: 'center' }}><div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 500 }}>{crewSize}</div><div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-3)' }}>PERSONNEL</div></div>}
              {repairHrs && <div style={{ flex: 1, textAlign: 'center' }}><div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 500 }}>{repairHrs}h</div><div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-3)' }}>EST. REPAIR</div></div>}
            </div>
            {!dispatched ? (
              <button onClick={() => setDispatched(true)} style={{ width: '100%', padding: '10px 14px', background: displayRisk.bg, border: `1px solid ${displayRisk.border}`, borderRadius: 'var(--radius)', fontFamily: MONO, fontSize: 11, fontWeight: 600, color: displayRisk.color, cursor: 'pointer' }}>⚡ DISPATCH CREW</button>
            ) : (
              <div style={{ background: 'var(--risk-low-light)', border: '1px solid var(--risk-low-border)', borderRadius: 'var(--radius)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--risk-low)' }} />
                <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--risk-low)' }}>✓ CREW DISPATCHED · ACTIVE</div>
              </div>
            )}
          </Card>
        )}
        <div style={{ height: 8 }} />
      </div>
    </div>
  );
}





