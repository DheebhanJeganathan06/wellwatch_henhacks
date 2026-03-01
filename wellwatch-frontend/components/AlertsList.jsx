'use client';

const MONO = 'var(--font-mono)';

const RISK_STYLES = {
  CRITICAL: { color: 'var(--risk-critical)', bg: 'var(--risk-critical-light)', border: 'var(--risk-critical-border)' },
  HIGH:     { color: 'var(--risk-high)',     bg: 'var(--risk-high-light)',     border: 'var(--risk-high-border)' },
  MEDIUM:   { color: 'var(--risk-medium)',   bg: 'var(--risk-medium-light)',   border: 'var(--risk-medium-border)' },
  LOW:      { color: 'var(--risk-low)',      bg: 'var(--risk-low-light)',      border: 'var(--risk-low-border)' },
  MINIMAL:  { color: 'var(--risk-minimal)',  bg: 'var(--risk-minimal-light)',  border: 'var(--risk-minimal-border)' },
};

function AlertCard({ alert, allWells, onWellClick }) {
  const r = RISK_STYLES[alert.risk_category] || RISK_STYLES.MINIMAL;

  // Find the full well object so WellPanel gets all fields
  const fullWell = allWells.find(w => w.api_number === alert.api_number) || alert;

  return (
    <div
      onClick={() => onWellClick(fullWell)}
      style={{
        background: 'var(--surface)',
        border: `1px solid ${r.border}`,
        borderRadius: 'var(--radius)',
        padding: '10px 12px',
        cursor: 'pointer',
        borderLeft: `3px solid ${r.color}`,
        transition: 'box-shadow 0.15s, background 0.15s',
      }}
      onMouseOver={e => {
        e.currentTarget.style.boxShadow = 'var(--shadow-md)';
        e.currentTarget.style.background = 'var(--surface-2)';
      }}
      onMouseOut={e => {
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.background = 'var(--surface)';
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12, fontWeight: 600, color: 'var(--text-1)',
            marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {alert.well_name || alert.api_number}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.05em' }}>
            {alert.api_number}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
          <span style={{
            fontFamily: MONO, fontSize: 8, fontWeight: 600,
            color: r.color, background: r.bg,
            border: `1px solid ${r.border}`,
            borderRadius: 4, padding: '1px 6px',
            letterSpacing: '0.08em',
          }}>
            {alert.risk_category}
          </span>
          <span style={{
            fontFamily: MONO, fontSize: 18, fontWeight: 500,
            color: r.color, lineHeight: 1,
          }}>
            {Math.round(alert.risk_score)}
          </span>
        </div>
      </div>

      {alert.latest_ch4_ppm != null && (
        <div style={{
          marginTop: 6, fontFamily: MONO, fontSize: 9,
          color: 'var(--text-3)', letterSpacing: '0.04em',
        }}>
          CH₄ {alert.latest_ch4_ppm.toFixed(1)} ppm
          {alert.recommended_action && (
            <span> · {alert.recommended_action.slice(0, 40)}{alert.recommended_action.length > 40 ? '…' : ''}</span>
          )}
        </div>
      )}
    </div>
  );
}

export default function AlertsList({ alerts, wells, onWellClick }) {
  const criticals = alerts.filter(a => a.risk_category === 'CRITICAL');
  const highs     = alerts.filter(a => a.risk_category === 'HIGH');
  const mediums   = alerts.filter(a => a.risk_category === 'MEDIUM');
  const noAlerts  = alerts.length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 3 }}>
            Alert Inbox
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
            {alerts.length} active wells
          </div>
        </div>

        {alerts.length > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'var(--risk-critical-light)',
            border: '1px solid var(--risk-critical-border)',
            borderRadius: 20, padding: '3px 10px',
          }}>
            <div style={{
              width: 5, height: 5, borderRadius: '50%',
              background: 'var(--risk-critical)',
              animation: 'blink 1.6s infinite',
            }} />
            <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--risk-critical)', letterSpacing: '0.08em', fontWeight: 600 }}>
              LIVE
            </span>
          </div>
        )}
      </div>

      {/* Alert list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>

        {noAlerts ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', gap: 10, color: 'var(--text-3)',
          }}>
            <div style={{ fontSize: 32 }}>✓</div>
            <div style={{ fontFamily: MONO, fontSize: 11, textAlign: 'center', letterSpacing: '0.06em' }}>
              No active alerts<br/>
              <span style={{ fontSize: 10 }}>Click a well on the map to inspect</span>
            </div>
          </div>
        ) : (
          <>
            {criticals.length > 0 && (
              <GroupLabel label="Critical" count={criticals.length} color="var(--risk-critical)" />
            )}
            {criticals.map(a => (
              <AlertCard key={a.api_number} alert={a} allWells={wells} onWellClick={onWellClick} />
            ))}

            {highs.length > 0 && (
              <GroupLabel label="High" count={highs.length} color="var(--risk-high)" />
            )}
            {highs.map(a => (
              <AlertCard key={a.api_number} alert={a} allWells={wells} onWellClick={onWellClick} />
            ))}

            {mediums.length > 0 && (
              <GroupLabel label="Medium" count={mediums.length} color="var(--risk-medium)" />
            )}
            {mediums.map(a => (
              <AlertCard key={a.api_number} alert={a} allWells={wells} onWellClick={onWellClick} />
            ))}
          </>
        )}
      </div>

      {/* Hint when no well is selected */}
      <div style={{
        padding: '10px 14px',
        borderTop: '1px solid var(--border-soft)',
        fontFamily: MONO, fontSize: 9, color: 'var(--text-3)',
        textAlign: 'center', letterSpacing: '0.05em', flexShrink: 0,
        background: 'var(--surface-2)',
      }}>
        Click any well marker to inspect ↑
      </div>
    </div>
  );
}

function GroupLabel({ label, count, color }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '4px 2px', marginTop: 4,
    }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontFamily: MONO, fontSize: 9, color, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>
        {label}
      </span>
      <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-3)' }}>
        ({count})
      </span>
    </div>
  );
}
