'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import StatsBar from '@/components/StatsBar';
import WellPanel from '@/components/WellPanel';
import AlertsList from '@/components/AlertsList';
import { fetchWellsMap, fetchStats, fetchAlerts } from '@/lib/api';

// Dynamically import the map to prevent SSR — mapbox-gl is browser-only
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
  const [wells, setWells]           = useState([]);
  const [stats, setStats]           = useState(null);
  const [alerts, setAlerts]         = useState([]);
  const [selectedWell, setSelected] = useState(null);
  const [loadingWells, setLoadingWells] = useState(true);
  const [error, setError]           = useState(null);

  // ── Initial data load ──────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetchWellsMap().catch(() => []),
      fetchStats().catch(() => null),
      fetchAlerts().catch(() => []),
    ]).then(([wellData, statsData, alertData]) => {
      setWells(wellData);
      setStats(statsData);
      setAlerts(alertData);
      setLoadingWells(false);
    }).catch(err => {
      setError(err.message);
      setLoadingWells(false);
    });
  }, []);

  const handleWellClick = useCallback((well) => {
    setSelected(well);
  }, []);

  const handlePanelClose = useCallback(() => {
    setSelected(null);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* ── Top stats bar ── */}
      <StatsBar stats={stats} alertCount={alerts.length} wellCount={wells.length} />

      {/* ── Main content ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative', minHeight: 0 }}>

        {/* Map */}
        <div style={{ flex: 1, position: 'relative', height: '100%', minHeight: 0, overflow: 'hidden' }}>
          {error && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 12, zIndex: 10,
              background: 'var(--bg)',
            }}>
              <div style={{ fontSize: 32 }}>⚠️</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--risk-critical)', textAlign: 'center' }}>
                Backend unreachable<br/>
                <span style={{ color: 'var(--text-3)', fontSize: 11 }}>{error}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                Is FastAPI running on {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}?
              </div>
            </div>
          )}

          <WellMap
            wells={wells}
            selectedWell={selectedWell}
            onWellClick={handleWellClick}
          />

          {/* Well count overlay */}
          {!loadingWells && wells.length > 0 && (
            <div style={{
              position: 'absolute', bottom: 32, left: 16, zIndex: 5,
              background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              padding: '8px 14px', boxShadow: 'var(--shadow-sm)',
              fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-2)',
              letterSpacing: '0.05em',
            }}>
              {wells.length.toLocaleString()} wells · click to inspect
            </div>
          )}
        </div>

        {/* ── Right panel — alert list or well detail ── */}
        <div style={{
          width: 'var(--panel-w)',
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          flexShrink: 0,
          boxShadow: '-2px 0 12px rgba(15,23,42,0.04)',
        }}>
          {selectedWell ? (
            <WellPanel well={selectedWell} onClose={handlePanelClose} />
          ) : (
            <AlertsList alerts={alerts} wells={wells} onWellClick={handleWellClick} />
          )}
        </div>
      </div>
    </div>
  );
}

