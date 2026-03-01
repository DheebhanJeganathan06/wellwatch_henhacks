'use client';


import { useState, useCallback, useEffect } from 'react';
import Map, { Marker, NavigationControl, ScaleControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';


// ── Risk color system ─────────────────────────────────────────────────
const RISK = {
  CRITICAL: { dot: '#BE123C', ring: 'rgba(190,18,60,0.2)',  size: 14 },
  HIGH:     { dot: '#C2410C', ring: 'rgba(194,65,12,0.18)', size: 12 },
  MEDIUM:   { dot: '#A16207', ring: 'rgba(161,98,7,0.15)',  size: 11 },
  LOW:      { dot: '#15803D', ring: 'rgba(21,128,61,0.15)', size: 10 },
  MINIMAL:  { dot: '#1D4ED8', ring: 'rgba(29,78,216,0.15)', size: 10 },
  UNKNOWN:  { dot: '#94A3B8', ring: 'rgba(148,163,184,0.1)',size: 9  },
};


function getRisk(cat) {
  return RISK[cat] || RISK.UNKNOWN;
}


// ── Individual well marker ────────────────────────────────────────────
function WellMarker({ well, isSelected, isCritical, onClick }) {
  const r = getRisk(well.risk_category);


  return (
    <div
      onClick={onClick}
      title={`${well.well_name || well.api_number} · ${well.risk_category || 'No triage'}`}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        width: 28,
        height: 28,
      }}
    >
      {isCritical && (
        <div style={{
          position: 'absolute',
          width: 26,
          height: 26,
          borderRadius: '50%',
          background: r.ring,
          animation: 'pulse-ring 1.8s ease-in-out infinite',
          pointerEvents: 'none',
        }} />
      )}


      {isSelected && (
        <div style={{
          position: 'absolute',
          width: r.size + 10,
          height: r.size + 10,
          borderRadius: '50%',
          border: `2px solid ${r.dot}`,
          opacity: 0.6,
          pointerEvents: 'none',
        }} />
      )}


      <div style={{
        width: isSelected ? r.size + 3 : r.size,
        height: isSelected ? r.size + 3 : r.size,
        borderRadius: '50%',
        background: r.dot,
        border: '2px solid rgba(255,255,255,0.85)',
        boxShadow: isSelected
          ? `0 0 0 3px ${r.dot}40, 0 2px 8px rgba(0,0,0,0.25)`
          : '0 1px 4px rgba(0,0,0,0.25)',
        transition: 'all 0.15s ease',
        flexShrink: 0,
      }} />
    </div>
  );
}


// ── Main Map component ────────────────────────────────────────────────
export default function WellMap({ wells, selectedWell, onWellClick }) {
  const [viewState, setViewState] = useState({
    latitude:  41.20,
    longitude: -77.75,
    zoom:      7.2,
  });


  useEffect(() => {
    if (selectedWell?.lat && selectedWell?.lon) {
      setViewState(v => ({
        ...v,
        latitude:  selectedWell.lat,
        longitude: selectedWell.lon,
        zoom: Math.max(v.zoom, 9),
      }));
    }
  }, [selectedWell?.api_number]);


  const handleClick = useCallback((well) => {
    onWellClick(well);
  }, [onWellClick]);


  const sortedWells = [...wells].sort((a, b) => {
    const order = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, MINIMAL: 0 };
    return (order[a.risk_category] ?? -1) - (order[b.risk_category] ?? -1);
  });


  return (
    <Map
      {...viewState}
      onMove={evt => setViewState(evt.viewState)}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
      reuseMaps
    >
      <NavigationControl position="bottom-right" showCompass={false} />
      <ScaleControl position="bottom-left" unit="imperial" style={{ marginBottom: 44 }} />


      {sortedWells
        .filter(w => w.lat != null && w.lon != null)
        .map(well => (
          <Marker
            key={well.api_number}
            latitude={well.lat}
            longitude={well.lon}
            anchor="center"
            onClick={e => {
              e.originalEvent.stopPropagation();
              handleClick(well);
            }}
          >
            <WellMarker
              well={well}
              isSelected={selectedWell?.api_number === well.api_number}
              isCritical={well.risk_category === 'CRITICAL'}
              onClick={() => handleClick(well)}
            />
          </Marker>
        ))}


      <Legend />
    </Map>
  );
}


// ── Legend overlay ────────────────────────────────────────────────────
function Legend() {
  return (
    <div style={{
      position: 'absolute',
      top: 16,
      left: 16,
      background: 'rgba(255,255,255,0.94)',
      backdropFilter: 'blur(8px)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '12px 14px',
      boxShadow: 'var(--shadow-md)',
      zIndex: 5,
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 9,
        letterSpacing: '0.12em', textTransform: 'uppercase',
        color: 'var(--text-3)', marginBottom: 8,
      }}>
        Risk Level
      </div>
      {Object.entries(RISK).filter(([k]) => k !== 'UNKNOWN').map(([cat, style]) => (
        <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: style.dot, flexShrink: 0,
            border: '1.5px solid rgba(255,255,255,0.8)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }} />
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10,
            color: 'var(--text-2)', letterSpacing: '0.04em',
          }}>
            {cat}
          </span>
        </div>
      ))}
    </div>
  );
}





