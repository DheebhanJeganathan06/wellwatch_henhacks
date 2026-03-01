'use client';

import { useState, useEffect, useCallback } from 'react';
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

  useEffect(() => {
    function fetchAll() {
      Promise.all([
        fetchWellsMap().catch(() => null),
        fetchStats().catch(() => null),
        fetchAlerts().catch(() => null),
      ]).then(([wellData, statsData, alertData]) => {
        if (wellData)  setWells(wellData);
        if (statsData) setStats(statsData);
        if (alertData) setAlerts(alertData);
        setLoadingWells(false);
        setLastUpdated(new Date());
      }).catch(err => {
        setError(err.message);
        setLoadingWells(false);
      });
    }

    // Fetch immediately on mount, then every 30 seconds
    fetchAll();
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleWellClick = useCallback((well) => setSelected(well), []);
  const handlePanelClose = useCallback(() => setSelected(null), []);

  // When triage completes, patch just the wells array so the sidebar
  // re-sorts the well into the correct risk group immediately.
  const handleTriageComplete = useCallback((apiNumber, result) => {
    setWells(prev => prev.map(w =>
      w.api_number === apiNumber
        ? { ...w, risk_score: result.risk_score, risk_category: result.risk_category }
        : w
    ));
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <StatsBar stats={stats} alertCount={alerts.length} wellCount={wells.length} lastUpdated={lastUpdated} />

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


