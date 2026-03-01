'use client';


import { useEffect, useRef, useState } from 'react';


const RISK_COLORS = {
  CRITICAL: '#BE123C',
  HIGH:     '#C2410C',
  MEDIUM:   '#A16207',
  LOW:      '#15803D',
  MINIMAL:  '#1D4ED8',
  UNKNOWN:  '#64748B',
};


const RISK = {
  CRITICAL: { dot: '#BE123C' },
  HIGH:     { dot: '#C2410C' },
  MEDIUM:   { dot: '#A16207' },
  LOW:      { dot: '#15803D' },
  MINIMAL:  { dot: '#1D4ED8' },
  UNKNOWN:  { dot: '#64748B' },
};


export default function WellMap({ wells, selectedWell, onWellClick }) {
  const mapContainer   = useRef(null);
  const mapRef         = useRef(null);
  const onWellClickRef = useRef(onWellClick);
  const [mapReady, setMapReady]   = useState(false);
  const [mlLib, setMlLib]         = useState(null);


  useEffect(() => { onWellClickRef.current = onWellClick; }, [onWellClick]);


  // ── Init map once ─────────────────────────────────────────────────
  useEffect(() => {
    let destroyed = false;


    import('maplibre-gl').then((mod) => {
      if (destroyed || !mapContainer.current) return;
      const ml = mod.default || mod;
      setMlLib(ml);


      const map = new ml.Map({
        container: mapContainer.current,
        style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
        center: [-77.75, 41.20],
        zoom: 7.2,
        attributionControl: false,
      });


      map.on('load', () => {
        if (destroyed) return;


        // Voyager style has blue water natively — no overrides needed


        // ── Add GeoJSON source (empty to start) ──
        map.addSource('wells', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });


        // ── Shadow layer (slightly bigger, dark) for pop ──
        map.addLayer({
          id: 'wells-shadow',
          type: 'circle',
          source: 'wells',
          paint: {
            'circle-radius': [
              'match', ['get', 'risk_category'],
              'CRITICAL', 11,
              'HIGH',      9,
              'MEDIUM',    8,
              'LOW',       7,
              'MINIMAL',   7,
              6
            ],
            'circle-color': 'rgba(0,0,0,0.18)',
            'circle-translate': [0, 2],
            'circle-blur': 0.4,
          },
        });


        // ── Main dot layer ──
        map.addLayer({
          id: 'wells-circles',
          type: 'circle',
          source: 'wells',
          paint: {
            'circle-radius': [
              'case',
              ['==', ['get', 'selected'], true], 13,
              ['match', ['get', 'risk_category'],
                'CRITICAL', 10,
                'HIGH',      8,
                'MEDIUM',    7,
                'LOW',       6,
                'MINIMAL',   6,
                5
              ]
            ],
            'circle-color': [
              'match', ['get', 'risk_category'],
              'CRITICAL', '#BE123C',
              'HIGH',     '#C2410C',
              'MEDIUM',   '#A16207',
              'LOW',      '#15803D',
              'MINIMAL',  '#1D4ED8',
              '#64748B'
            ],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#FFFFFF',
            'circle-opacity': 0.95,
          },
        });


        // ── Pulse ring for CRITICAL wells ──
        map.addLayer({
          id: 'wells-critical-ring',
          type: 'circle',
          source: 'wells',
          filter: ['==', ['get', 'risk_category'], 'CRITICAL'],
          paint: {
            'circle-radius': 16,
            'circle-color': 'rgba(190,18,60,0)',
            'circle-stroke-width': 1.5,
            'circle-stroke-color': 'rgba(190,18,60,0.45)',
            'circle-opacity': 0.6,
          },
        });


        // ── Click handler ──
        map.on('click', 'wells-circles', (e) => {
          if (!e.features || e.features.length === 0) return;
          const props = e.features[0].properties;
          // Find the full well object from props.api_number
          const well = wells.find(w => w.api_number === props.api_number);
          if (well) onWellClickRef.current(well);
        });


        // ── Hover cursor ──
        map.on('mouseenter', 'wells-circles', () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'wells-circles', () => {
          map.getCanvas().style.cursor = '';
        });


        setMapReady(true);
      });


      mapRef.current = map;
    });


    return () => {
      destroyed = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      setMapReady(false);
    };
  }, []);


  // ── Update GeoJSON data when wells or selection changes ───────────
  useEffect(() => {
    if (!mapReady || !mapRef.current || wells.length === 0) return;


    const map = mapRef.current;
    const source = map.getSource('wells');
    if (!source) return;


    const features = wells
      .filter(w => w.lat != null && w.lon != null)
      .map(w => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          // GeoJSON is [longitude, latitude]
          coordinates: [w.lon, w.lat],
        },
        properties: {
          api_number:    w.api_number,
          risk_category: w.risk_category || 'UNKNOWN',
          well_name:     w.well_name || w.api_number,
          selected:      selectedWell?.api_number === w.api_number,
        },
      }));


    source.setData({ type: 'FeatureCollection', features });


    // Also update click handler with fresh wells reference
    map.off('click', 'wells-circles');
    map.on('click', 'wells-circles', (e) => {
      if (!e.features || e.features.length === 0) return;
      const api = e.features[0].properties.api_number;
      const well = wells.find(w => w.api_number === api);
      if (well) onWellClickRef.current(well);
    });


  }, [mapReady, wells, selectedWell]);


  // ── Fly to selected well ──────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current || !selectedWell?.lat) return;
    mapRef.current.flyTo({
      center: [selectedWell.lon, selectedWell.lat],
      zoom: Math.max(mapRef.current.getZoom(), 10),
      duration: 800,
    });
  }, [mapReady, selectedWell?.api_number]);


  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {/* Map canvas — full size, clipped to container */}
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />


      {/* Legend */}
      <div style={{
        position: 'absolute', top: 16, left: 16, zIndex: 20,
        background: 'rgba(255,255,255,0.96)',
        border: '1px solid #E2E8F0', borderRadius: 8,
        padding: '12px 14px',
        boxShadow: '0 4px 12px rgba(15,23,42,0.10)',
        pointerEvents: 'none',
      }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 9,
          letterSpacing: '0.12em', textTransform: 'uppercase',
          color: '#94A3B8', marginBottom: 8,
        }}>
          Risk Level
        </div>
        {Object.entries(RISK).filter(([k]) => k !== 'UNKNOWN').map(([cat, style]) => (
          <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{
              width: 12, height: 12, borderRadius: '50%',
              background: style.dot, flexShrink: 0,
              border: '2px solid white',
              boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
            }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#475569' }}>
              {cat}
            </span>
          </div>
        ))}
      </div>


      {/* Well count */}
      {wells.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 32, left: 16, zIndex: 20,
          background: 'rgba(255,255,255,0.92)',
          border: '1px solid #E2E8F0',
          borderRadius: 8, padding: '8px 14px',
          fontFamily: 'var(--font-mono)', fontSize: 11, color: '#475569',
          pointerEvents: 'none',
        }}>
          {wells.filter(w => w.lat && w.lon).length.toLocaleString()} wells · click to inspect
        </div>
      )}
    </div>
  );
}





