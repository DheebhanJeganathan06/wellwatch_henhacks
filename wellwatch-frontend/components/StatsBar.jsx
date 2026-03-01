'use client';


import Logo from '@/components/Logo';
import Toolbar from '@/components/Toolbar';


const MONO = 'var(--font-mono)';


function Divider() {
  return <div style={{ width: 1, height: 28, background: 'var(--border)', flexShrink: 0 }} />;
}


// Small arrow + % change indicator
function Trend({ delta, invert = false }) {
  if (delta == null || Math.abs(delta) < 0.05) return null;
  // invert = true means "up is bad" (risk score), "up is bad" (methane)
  const up      = delta > 0;
  const bad     = invert ? up : !up;
  const color   = bad ? '#EF4444' : '#22C55E';
  const arrow   = up ? '↑' : '↓';
  const pct     = Math.abs(delta).toFixed(1);
  return (
    <span style={{
      fontFamily: MONO, fontSize: 9, fontWeight: 700,
      color, letterSpacing: '0.04em',
      marginLeft: 4, whiteSpace: 'nowrap',
    }}>
      {arrow} {pct}
    </span>
  );
}


function Stat({ label, value, color, pulse, trend, invertTrend }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
      <div style={{
        fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em',
        textTransform: 'uppercase', color: 'var(--text-3)',
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {pulse && (
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: color || 'var(--green)',
            animation: 'blink 2s ease infinite',
            flexShrink: 0,
          }} />
        )}
        <div style={{
          fontFamily: MONO, fontSize: 20, fontWeight: 500,
          color: color || 'var(--text-1)', lineHeight: 1,
          display: 'flex', alignItems: 'baseline',
        }}>
          {value ?? <span style={{ color: 'var(--text-3)', fontSize: 14 }}>—</span>}
          {value != null && <Trend delta={trend} invert={invertTrend} />}
        </div>
      </div>
    </div>
  );
}


export default function StatsBar({ stats, alertCount, wellCount, lastUpdated, wells, onBulkTriageComplete, deltas }) {
  const avgRisk = stats?.avg_risk_score != null
    ? stats.avg_risk_score.toFixed(1)
    : null;


  const methanePpm = stats?.total_methane_debt_ppm != null
    ? (stats.total_methane_debt_ppm / 1000).toFixed(1) + 'k'
    : null;


  return (
    <header style={{
      height: 'var(--header-h)',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 20px',
      gap: 18,
      position: 'sticky',
      top: 0,
      zIndex: 100,
      boxShadow: 'var(--shadow-sm)',
      flexShrink: 0,
    }}>


      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}>
        <Logo size={32} />
        <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 500, letterSpacing: '0.15em', color: '#1C2B45' }}>
          WELL<span style={{ color: '#1A9E6B' }}>WATCH</span>
        </span>
      </div>


      <Divider />


      <Stat
        label="Wells Monitored"
        value={wellCount > 0 ? wellCount.toLocaleString() : (stats?.total_wells?.toLocaleString() ?? '—')}
        color="var(--green)"
        pulse
      />


      <Divider />


      <Stat
        label="Active Alerts"
        value={alertCount != null ? alertCount : (stats?.active_alerts ?? '—')}
        color={alertCount > 0 ? 'var(--risk-critical)' : 'var(--text-1)'}
        pulse={alertCount > 0}
      />


      <Divider />


      <Stat
        label="Avg Risk Score"
        value={avgRisk}
        color={
          avgRisk > 70 ? 'var(--risk-critical)' :
          avgRisk > 50 ? 'var(--risk-high)' :
          avgRisk > 30 ? 'var(--risk-medium)' : 'var(--text-1)'
        }
        trend={deltas?.risk}
        invertTrend={true}
      />


      <Divider />


      <Stat
        label="CH₄ Debt · ppm above ambient"
        value={methanePpm}
        color="var(--text-2)"
        trend={deltas?.methane}
        invertTrend={true}
      />


      <Toolbar wells={wells || []} onBulkTriageComplete={onBulkTriageComplete} />


      {/* Live indicator */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#1A9E6B', animation: 'blink 2.4s ease infinite' }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <span style={{ fontFamily: MONO, fontSize: 10, color: '#1A9E6B', letterSpacing: '0.08em' }}>LIVE · PA-DEP</span>
          {lastUpdated && (
            <span style={{ fontFamily: MONO, fontSize: 8, color: 'var(--text-3)', letterSpacing: '0.05em' }}>
              updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}



