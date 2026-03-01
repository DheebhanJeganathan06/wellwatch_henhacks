'use client';

import Logo from '@/components/Logo';

const MONO = 'var(--font-mono)';

function Divider() {
  return <div style={{ width: 1, height: 28, background: 'var(--border)', flexShrink: 0 }} />;
}

function Stat({ label, value, color, pulse }) {
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
        }}>
          {value ?? <span style={{ color: 'var(--text-3)', fontSize: 14 }}>—</span>}
        </div>
      </div>
    </div>
  );
}

export default function StatsBar({ stats, alertCount, wellCount, lastUpdated }) {
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
      gap: 24,
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
      />

      <Divider />

      <Stat
        label="CH₄ Debt · ppm above ambient"
        value={methanePpm}
        color="var(--text-2)"
      />

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


