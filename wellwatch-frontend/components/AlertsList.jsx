'use client';


import { useState } from 'react';


const MONO = 'var(--font-mono)';


const RISK_STYLES = {
  CRITICAL: { color: 'var(--risk-critical)', bg: 'var(--risk-critical-light)', border: 'var(--risk-critical-border)' },
  HIGH:     { color: 'var(--risk-high)',     bg: 'var(--risk-high-light)',     border: 'var(--risk-high-border)' },
  MEDIUM:   { color: 'var(--risk-medium)',   bg: 'var(--risk-medium-light)',   border: 'var(--risk-medium-border)' },
  LOW:      { color: 'var(--risk-low)',      bg: 'var(--risk-low-light)',      border: 'var(--risk-low-border)' },
  MINIMAL:  { color: 'var(--risk-minimal)',  bg: 'var(--risk-minimal-light)',  border: 'var(--risk-minimal-border)' },
};


// Raw hex colours to match the map legend
const RISK_HEX = {
  CRITICAL: '#BE123C',
  HIGH:     '#C2410C',
  MEDIUM:   '#A16207',
  LOW:      '#15803D',
  MINIMAL:  '#1D4ED8',
};


const LEVELS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'MINIMAL'];


function DonutChart({ wells }) {
  const counts = LEVELS.map(l => ({ level: l, count: wells.filter(w => w.risk_category === l).length }))
    .filter(d => d.count > 0);
  const total = counts.reduce((s, d) => s + d.count, 0);
  if (total === 0) return null;


  const R = 26, cx = 30, cy = 30;
  const circumference = 2 * Math.PI * R;
  let offset = 0;
  const slices = counts.map(d => {
    const frac  = d.count / total;
    const dash  = frac * circumference;
    const gap   = circumference - dash;
    const slice = { ...d, dash, gap, offset };
    offset += dash;
    return slice;
  });


  return (
    <svg width="60" height="60" viewBox="0 0 60 60" style={{ flexShrink: 0 }}>
      {/* Track */}
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--border)" strokeWidth="8" />
      {/* Slices */}
      {slices.map(s => (
        <circle
          key={s.level}
          cx={cx} cy={cy} r={R}
          fill="none"
          stroke={RISK_HEX[s.level]}
          strokeWidth="8"
          strokeDasharray={`${s.dash} ${s.gap}`}
          strokeDashoffset={-s.offset}
          transform={`rotate(-90 ${cx} ${cy})`}
          strokeLinecap="butt"
        />
      ))}
      {/* Logo in centre — background circle + derrick SVG scaled down */}
      <circle cx={cx} cy={cy} r="15" fill="#F0F3F8" stroke="#DDE3EE" strokeWidth="1" />
      {/* IoT signal waves */}
      <path d="M 23.5 24.5 Q 30 18 36.5 24.5" fill="none" stroke="#1A9E6B" strokeWidth="2" strokeLinecap="round" />
      <path d="M 26.5 27.5 Q 30 23 33.5 27.5" fill="none" stroke="#1A9E6B" strokeWidth="2" strokeLinecap="round" />
      <circle cx="30" cy="30" r="1.5" fill="#1A9E6B" />
      {/* Derrick */}
      <path d="M 30 31 L 23.5 45 L 36.5 45 Z" fill="none" stroke="#1C2B45" strokeWidth="2.2" strokeLinejoin="round" />
      <line x1="27.5" y1="37" x2="32.5" y2="37" stroke="#1C2B45" strokeWidth="1.8" />
      <line x1="25.5" y1="42" x2="34.5" y2="42" stroke="#1C2B45" strokeWidth="1.8" />
      <line x1="21" y1="45" x2="39" y2="45" stroke="#1C2B45" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}


function WellCard({ well, onWellClick }) {
  const r = RISK_STYLES[well.risk_category] || RISK_STYLES.MINIMAL;
  return (
    <div
      onClick={() => onWellClick(well)}
      style={{
        background: 'var(--surface)', border: `1px solid ${r.border}`,
        borderRadius: 'var(--radius)', padding: '10px 12px',
        cursor: 'pointer', borderLeft: `3px solid ${r.color}`,
        transition: 'box-shadow 0.15s, background 0.15s',
      }}
      onMouseOver={e => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.background = 'var(--surface-2)'; }}
      onMouseOut={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.background = 'var(--surface)'; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {well.well_name || well.api_number}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.05em' }}>
            {well.api_number}{well.county ? ` · ${well.county}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
          <span style={{ fontFamily: MONO, fontSize: 8, fontWeight: 600, color: r.color, background: r.bg, border: `1px solid ${r.border}`, borderRadius: 4, padding: '1px 6px', letterSpacing: '0.08em' }}>
            {well.risk_category}
          </span>
          {well.risk_score != null && (
            <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 500, color: r.color, lineHeight: 1 }}>
              {Math.round(well.risk_score)}
            </span>
          )}
        </div>
      </div>
      {well.recommended_action && (
        <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.04em' }}>
          {well.recommended_action.slice(0, 55)}{well.recommended_action.length > 55 ? '…' : ''}
        </div>
      )}
    </div>
  );
}


// Collapsible section for HIGH and MEDIUM
function CollapsibleGroup({ level, wells, onWellClick }) {
  const [open, setOpen] = useState(false);
  const r = RISK_STYLES[level];
  if (wells.length === 0) return null;


  return (
    <div style={{ marginBottom: 2 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', padding: '8px 6px',
          background: open ? r.bg : 'none',
          border: `1px solid ${open ? r.border : 'transparent'}`,
          borderRadius: 6, cursor: 'pointer',
          transition: 'background 0.15s, border-color 0.15s',
        }}
        onMouseOver={e => { if (!open) e.currentTarget.style.background = 'var(--surface-2)'; }}
        onMouseOut={e => { if (!open) e.currentTarget.style.background = 'none'; }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: r.color, flexShrink: 0 }} />
          <span style={{ fontFamily: MONO, fontSize: 9, color: r.color, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600 }}>
            {level}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-3)' }}>
            {wells.length} {wells.length === 1 ? 'well' : 'wells'}
          </span>
        </div>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease', flexShrink: 0 }}>
          <path d="M2 4l4 4 4-4" stroke="var(--text-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>


      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '6px 0 4px', animation: 'fade-up 0.18s ease' }}>
          {wells.map(w => <WellCard key={w.api_number} well={w} onWellClick={onWellClick} />)}
        </div>
      )}
    </div>
  );
}


export default function AlertsList({ alerts, wells, onWellClick }) {
  // All levels sourced from `wells` — the single source of truth that
  // gets patched immediately when triage runs. Using `alerts` for critical
  // caused it to lag behind since alerts only refreshes on the poll interval.
  const criticalWells = wells.filter(w => w.risk_category === 'CRITICAL').sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0));
  const highWells     = wells.filter(w => w.risk_category === 'HIGH').sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0));
  const mediumWells   = wells.filter(w => w.risk_category === 'MEDIUM').sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0));
  const lowWells      = wells.filter(w => w.risk_category === 'LOW').sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0));
  const minimalWells  = wells.filter(w => w.risk_category === 'MINIMAL').sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0));


  const totalShown = criticalWells.length + highWells.length + mediumWells.length + lowWells.length + minimalWells.length;


  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>


      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
          <DonutChart wells={wells} />
          <div>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 3 }}>Alert Inbox</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>{totalShown} wells flagged</div>
          </div>
        </div>
        {criticalWells.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--risk-critical-light)', border: '1px solid var(--risk-critical-border)', borderRadius: 20, padding: '3px 10px', flexShrink: 0 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--risk-critical)', animation: 'blink 1.6s infinite' }} />
            <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--risk-critical)', letterSpacing: '0.08em', fontWeight: 600 }}>LIVE</span>
          </div>
        )}
      </div>


      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>


        {totalShown === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, color: 'var(--text-3)' }}>
            <div style={{ fontSize: 32 }}>✓</div>
            <div style={{ fontFamily: MONO, fontSize: 11, textAlign: 'center', letterSpacing: '0.06em' }}>
              No flagged wells<br/>
              <span style={{ fontSize: 10 }}>Click a well on the map to inspect</span>
            </div>
          </div>
        ) : (
          <>
            {/* ── CRITICAL — always visible, no toggle ── */}
            {criticalWells.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 2px 8px' }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--risk-critical)', animation: 'blink 1.8s infinite', flexShrink: 0 }} />
                  <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--risk-critical)', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600 }}>
                    Critical · {criticalWells.length} {criticalWells.length === 1 ? 'well' : 'wells'}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {criticalWells.map(w => <WellCard key={w.api_number} well={w} onWellClick={onWellClick} />)}
                </div>
              </div>
            )}


            {/* Divider if critical wells exist and there are more below */}
            {criticalWells.length > 0 && (highWells.length > 0 || mediumWells.length > 0) && (
              <div style={{ height: 1, background: 'var(--border-soft)', margin: '4px 0' }} />
            )}


            {/* ── HIGH — collapsible ── */}
            <CollapsibleGroup level="HIGH" wells={highWells} onWellClick={onWellClick} />


            {/* ── MEDIUM — collapsible ── */}
            <CollapsibleGroup level="MEDIUM" wells={mediumWells} onWellClick={onWellClick} />


            {/* ── LOW — collapsible ── */}
            <CollapsibleGroup level="LOW" wells={lowWells} onWellClick={onWellClick} />


            {/* ── MINIMAL — collapsible ── */}
            <CollapsibleGroup level="MINIMAL" wells={minimalWells} onWellClick={onWellClick} />
          </>
        )}
      </div>


      {/* Footer */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border-soft)', fontFamily: MONO, fontSize: 9, color: 'var(--text-3)', textAlign: 'center', letterSpacing: '0.05em', flexShrink: 0, background: 'var(--surface-2)' }}>
        Click any well marker to inspect ↑
      </div>
    </div>
  );
}



