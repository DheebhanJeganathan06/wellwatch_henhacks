'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import StatsBar from '@/components/StatsBar';
import WellPanel from '@/components/WellPanel';
import AlertsList from '@/components/AlertsList';
import { fetchWellsMap, fetchStats, fetchAlerts } from '@/lib/api';

const WellMap = dynamic(() => import('@/components/WellMap'), {
  ssr: false,
  loading: () => (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', color: 'var(--text-3)', fontFamily: 'var(--font-mono)',
      fontSize: 13, letterSpacing: '0.05em',
    }}>
      LOADING MAP…
    </div>
  ),
});

export default function HomePage() {
  const [wells, setWells]               = useState([]);
  const [stats, setStats]               = useState(null);
  const [alerts, setAlerts]             = useState([]);
  const [selectedWell, setSelected]     = useState(null);
  const [loadingWells, setLoadingWells] = useState(true);
  const [error, setError]               = useState(null);
  const [lastUpdated, setLastUpdated]   = useState(null);
  const [deltas, setDeltas]             = useState({ risk: null, methane: null });
  const prevStatsRef                    = useRef(null);

  useEffect(() => {
    function fetchAll() {
      Promise.all([
        fetchWellsMap().catch(() => null),
        fetchStats().catch(() => null),
        fetchAlerts().catch(() => null),
      ]).then(([wellData, statsData, alertData]) => {
        if (wellData)  setWells(wellData);
        if (alertData) setAlerts(alertData);
        if (statsData) {
          // Compute deltas vs previous poll
          if (prevStatsRef.current) {
            const prev = prevStatsRef.current;
            const riskDelta    = statsData.avg_risk_score    != null && prev.avg_risk_score    != null
              ? statsData.avg_risk_score    - prev.avg_risk_score    : null;
            const methaneDelta = statsData.total_methane_debt_ppm != null && prev.total_methane_debt_ppm != null
              ? statsData.total_methane_debt_ppm - prev.total_methane_debt_ppm : null;
            setDeltas({ risk: riskDelta, methane: methaneDelta });
          }
          prevStatsRef.current = statsData;
          setStats(statsData);
        }
        setLoadingWells(false);
        setLastUpdated(new Date());
      }).catch(err => {
        setError(err.message);
        setLoadingWells(false);
      });
    }

    fetchAll();
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleWellClick = useCallback((well) => setSelected(well), []);
  const handlePanelClose = useCallback(() => setSelected(null), []);

  const handleTriageComplete = useCallback((apiNumber, result) => {
    setWells(prev => prev.map(w =>
      w.api_number === apiNumber
        ? { ...w, risk_score: result.risk_score, risk_category: result.risk_category }
        : w
    ));
  }, []);

  const handleBulkTriageComplete = useCallback((results) => {
    setWells(prev => prev.map(w => {
      const result = results.find(r => r.api_number === w.api_number);
      if (!result) return w;
      return { ...w, risk_score: result.risk_score, risk_category: result.risk_category };
    }));
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <StatsBar stats={stats} alertCount={alerts.length} wellCount={wells.length} lastUpdated={lastUpdated} wells={wells} onBulkTriageComplete={handleBulkTriageComplete} deltas={deltas} />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative', minHeight: 0 }}>

        {/* Map */}
        <div style={{ flex: 1, position: 'relative', height: '100%', minHeight: 0, overflow: 'hidden' }}>
          {error && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 12, zIndex: 10, background: 'var(--bg)',
            }}>
              <div style={{ fontSize: 32 }}>⚠️</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--risk-critical)', textAlign: 'center' }}>
                Backend unreachable<br/>
                <span style={{ color: 'var(--text-3)', fontSize: 11 }}>{error}</span>
              </div>
            </div>
          )}
          <WellMap wells={wells} selectedWell={selectedWell} onWellClick={handleWellClick} />
        </div>

        {/* Right panel */}
        <div style={{
          width: 'var(--panel-w)', background: 'var(--surface)',
          borderLeft: '1px solid var(--border)', display: 'flex',
          flexDirection: 'column', overflow: 'hidden', flexShrink: 0,
          boxShadow: '-2px 0 12px rgba(15,23,42,0.04)',
        }}>
          {selectedWell ? (
            <WellPanel well={selectedWell} onClose={handlePanelClose} onTriageComplete={handleTriageComplete} />
          ) : (
            <AlertsList alerts={alerts} wells={wells} onWellClick={handleWellClick} />
          )}
        </div>
      </div>
    </div>
  );
}


