'use client';


import { useEffect, useRef, useState, useCallback } from 'react';
import { fetchWellReadings } from '@/lib/api';


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


const MONO = 'var(--font-mono)';


export default function WellMap({ wells, selectedWell, onWellClick }) {
  const mapContainer   = useRef(null);
  const mapRef         = useRef(null);
  const onWellClickRef = useRef(onWellClick);
  const wellsRef       = useRef(wells);
  const readingCache   = useRef({});
  const [mapReady, setMapReady] = useState(false);
  const [tooltip, setTooltip]   = useState(null);
  const [bearing, setBearing]   = useState(0);


  useEffect(() => { onWellClickRef.current = onWellClick; }, [onWellClick]);
  useEffect(() => { wellsRef.current = wells; }, [wells]);


  // ── Init map ─────────────────────────────────────────────────────
  useEffect(() => {
    let destroyed = false;


    import('maplibre-gl').then((mod) => {
      if (destroyed || !mapContainer.current) return;
      const ml = mod.default || mod;


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


        // ── GeoJSON source ──
        map.addSource('wells', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });


        // ── Shadow ──
        map.addLayer({
          id: 'wells-shadow', type: 'circle', source: 'wells',
          paint: {
            'circle-radius': ['match', ['get', 'risk_category'], 'CRITICAL', 11, 'HIGH', 9, 'MEDIUM', 8, 'LOW', 7, 'MINIMAL', 7, 6],
            'circle-color': 'rgba(0,0,0,0.18)',
            'circle-translate': [0, 2],
            'circle-blur': 0.4,
          },
        });


        // ── Main dots ──
        map.addLayer({
          id: 'wells-circles', type: 'circle', source: 'wells',
          paint: {
            'circle-radius': [
              'case', ['==', ['get', 'selected'], true], 13,
              ['match', ['get', 'risk_category'], 'CRITICAL', 10, 'HIGH', 8, 'MEDIUM', 7, 'LOW', 6, 'MINIMAL', 6, 5]
            ],
            'circle-color': [
              'match', ['get', 'risk_category'],
              'CRITICAL', '#BE123C', 'HIGH', '#C2410C', 'MEDIUM', '#A16207',
              'LOW', '#15803D', 'MINIMAL', '#1D4ED8', '#64748B'
            ],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#FFFFFF',
            'circle-opacity': 0.95,
          },
        });


        // ── Critical ring ──
        map.addLayer({
          id: 'wells-critical-ring', type: 'circle', source: 'wells',
          filter: ['==', ['get', 'risk_category'], 'CRITICAL'],
          paint: {
            'circle-radius': 16,
            'circle-color': 'rgba(190,18,60,0)',
            'circle-stroke-width': 1.5,
            'circle-stroke-color': 'rgba(190,18,60,0.45)',
            'circle-opacity': 0.6,
          },
        });


        // ── Click ──
        map.on('click', 'wells-circles', (e) => {
          if (!e.features?.length) return;
          const api = e.features[0].properties.api_number;
          const well = wellsRef.current.find(w => w.api_number === api);
          if (well) onWellClickRef.current(well);
        });


        // ── Hover: show tooltip ──
        map.on('mouseenter', 'wells-circles', async (e) => {
          map.getCanvas().style.cursor = 'pointer';
          if (!e.features?.length) return;


          const props = e.features[0].properties;
          const api   = props.api_number;
          const well  = wellsRef.current.find(w => w.api_number === api);
          if (!well) return;


          const rect = mapContainer.current.getBoundingClientRect();
          const x = e.originalEvent.clientX - rect.left;
          const y = e.originalEvent.clientY - rect.top;


          // Show immediately with loading state
          setTooltip({ x, y, well, ch4: null, pressure: null, loading: true });


          // Use cache if available
          if (readingCache.current[api]) {
            const { ch4, pressure } = readingCache.current[api];
            setTooltip({ x, y, well, ch4, pressure, loading: false });
            return;
          }


          // Fetch latest single reading
          try {
            const readings = await fetchWellReadings(api, 1);
            const latest = readings?.[0] ?? null;
            const ch4      = latest?.ch4_ppm      ?? null;
            const pressure = latest?.pressure_psi  ?? null;
            readingCache.current[api] = { ch4, pressure };
            setTooltip(prev =>
              prev?.well?.api_number === api
                ? { ...prev, ch4, pressure, loading: false }
                : prev
            );
          } catch {
            setTooltip(prev =>
              prev?.well?.api_number === api
                ? { ...prev, loading: false }
                : prev
            );
          }
        });


        // ── Mouse move: update tooltip position ──
        map.on('mousemove', 'wells-circles', (e) => {
          const rect = mapContainer.current?.getBoundingClientRect();
          if (!rect) return;
          setTooltip(prev => prev ? {
            ...prev,
            x: e.originalEvent.clientX - rect.left,
            y: e.originalEvent.clientY - rect.top,
          } : prev);
        });


        // ── Mouse leave: hide tooltip ──
        map.on('mouseleave', 'wells-circles', () => {
          map.getCanvas().style.cursor = '';
          setTooltip(null);
        });


        // Track bearing for compass
        map.on('rotate', () => setBearing(map.getBearing()));


        // Subtle green land tint — Voyager layer IDs
        const landLayers = ['background', 'landcover', 'land', 'landuse'];
        landLayers.forEach(id => {
          if (!map.getLayer(id)) return;
          const type = map.getLayer(id).type;
          try {
            if (type === 'background') {
              map.setPaintProperty(id, 'background-color', '#dceede');
            } else if (type === 'fill') {
              map.setPaintProperty(id, 'fill-color', '#d4ead6');
            }
          } catch(e) {}
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


  // ── Update GeoJSON ───────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current || wells.length === 0) return;
    const map = mapRef.current;
    const source = map.getSource('wells');
    if (!source) return;


    const features = wells
      .filter(w => w.lat != null && w.lon != null)
      .map(w => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [w.lon, w.lat] },
        properties: {
          api_number:    w.api_number,
          risk_category: w.risk_category || 'UNKNOWN',
          well_name:     w.well_name || w.api_number,
          selected:      selectedWell?.api_number === w.api_number,
        },
      }));


    source.setData({ type: 'FeatureCollection', features });


    map.off('click', 'wells-circles');
    map.on('click', 'wells-circles', (e) => {
      if (!e.features?.length) return;
      const api = e.features[0].properties.api_number;
      const well = wellsRef.current.find(w => w.api_number === api);
      if (well) onWellClickRef.current(well);
    });
  }, [mapReady, wells, selectedWell]);


  // ── Fly to selected ──────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current || !selectedWell?.lat) return;
    mapRef.current.flyTo({
      center: [selectedWell.lon, selectedWell.lat],
      zoom: Math.max(mapRef.current.getZoom(), 10),
      duration: 800,
    });
  }, [mapReady, selectedWell?.api_number]);


  // ── Tooltip position: flip left/up near edges ────────────────────
  const getTooltipStyle = () => {
    if (!tooltip || !mapContainer.current) return {};
    const { x, y } = tooltip;
    const W = mapContainer.current.offsetWidth;
    const H = mapContainer.current.offsetHeight;
    const flipX = x > W - 220;
    const flipY = y > H - 130;
    return {
      left:      flipX ? 'auto'      : x + 14,
      right:     flipX ? W - x + 14  : 'auto',
      top:       flipY ? 'auto'      : y + 14,
      bottom:    flipY ? H - y + 14  : 'auto',
    };
  };


  const rc = tooltip ? (RISK_COLORS[tooltip.well?.risk_category] || RISK_COLORS.UNKNOWN) : null;


  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />


      {/* ── Hover Tooltip ── */}
      {tooltip && (
        <div style={{
          position: 'absolute',
          ...getTooltipStyle(),
          zIndex: 50,
          pointerEvents: 'none',
          background: 'rgba(15, 23, 42, 0.93)',
          backdropFilter: 'blur(10px)',
          border: `1px solid ${rc}55`,
          borderRadius: 8,
          padding: '10px 13px',
          minWidth: 190,
          maxWidth: 240,
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          animation: 'fade-up 0.12s ease',
        }}>
          {/* Well name + risk badge */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#F1F5F9', lineHeight: 1.3, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {tooltip.well.well_name || tooltip.well.api_number}
            </div>
            <span style={{
              fontFamily: MONO, fontSize: 8, fontWeight: 700,
              color: rc, background: `${rc}22`,
              border: `1px solid ${rc}55`,
              borderRadius: 4, padding: '1px 6px',
              letterSpacing: '0.08em', flexShrink: 0,
            }}>
              {tooltip.well.risk_category || 'UNKNOWN'}
            </span>
          </div>


          {/* Divider */}
          <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', marginBottom: 8 }} />


          {/* Telemetry */}
          {tooltip.loading ? (
            <div style={{ fontFamily: MONO, fontSize: 9, color: '#64748B', letterSpacing: '0.06em' }}>
              fetching telemetry…
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: MONO, fontSize: 9, color: '#94A3B8', letterSpacing: '0.06em' }}>CH₄</span>
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: tooltip.ch4 != null ? '#FCD34D' : '#475569' }}>
                  {tooltip.ch4 != null ? `${tooltip.ch4.toFixed(1)} ppm` : '—'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: MONO, fontSize: 9, color: '#94A3B8', letterSpacing: '0.06em' }}>Pressure</span>
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: tooltip.pressure != null ? '#7DD3FC' : '#475569' }}>
                  {tooltip.pressure != null ? `${tooltip.pressure.toFixed(1)} psi` : '—'}
                </span>
              </div>
              {tooltip.well.risk_score != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: MONO, fontSize: 9, color: '#94A3B8', letterSpacing: '0.06em' }}>Risk Score</span>
                  <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: rc }}>
                    {Math.round(tooltip.well.risk_score)}
                  </span>
                </div>
              )}
            </div>
          )}


          {/* Footer hint */}
          <div style={{ marginTop: 8, fontFamily: MONO, fontSize: 8, color: '#334155', letterSpacing: '0.05em' }}>
            click to inspect →
          </div>
        </div>
      )}


      {/* Legend */}
      <div style={{
        position: 'absolute', top: 16, left: 16, zIndex: 20,
        background: 'rgba(255,255,255,0.96)',
        border: '1px solid #E2E8F0', borderRadius: 8,
        padding: '12px 14px',
        boxShadow: '0 4px 12px rgba(15,23,42,0.10)',
        pointerEvents: 'none',
      }}>
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94A3B8', marginBottom: 8 }}>
          Risk Level
        </div>
        {Object.entries(RISK).filter(([k]) => k !== 'UNKNOWN').map(([cat, style]) => (
          <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: style.dot, flexShrink: 0, border: '2px solid white', boxShadow: '0 1px 4px rgba(0,0,0,0.25)' }} />
            <span style={{ fontFamily: MONO, fontSize: 10, color: '#475569' }}>{cat}</span>
          </div>
        ))}
      </div>


      {/* Well count */}
      {wells.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 32, left: 16, zIndex: 20,
          background: 'rgba(255,255,255,0.92)',
          border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 14px',
          fontFamily: MONO, fontSize: 11, color: '#475569', pointerEvents: 'none',
        }}>
          {wells.filter(w => w.lat && w.lon).length.toLocaleString()} wells · click to inspect
        </div>
      )}


      {/* Compass + Zoom controls */}
      <div style={{
        position: 'absolute', bottom: 32, right: 16, zIndex: 100,
        display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        {/* Compass — rotates with map, click resets north */}
        <button
          onClick={() => mapRef.current?.rotateTo(0, { duration: 300 })}
          title="Reset to north"
          style={{
            width: 32, height: 32,
            background: 'rgba(255,255,255,0.96)',
            border: '1px solid #E2E8F0', borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', padding: 0,
            boxShadow: '0 2px 6px rgba(15,23,42,0.12)',
            transition: 'background 0.15s, box-shadow 0.15s',
          }}
          onMouseOver={e => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.boxShadow = '0 4px 10px rgba(15,23,42,0.18)'; }}
          onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.96)'; e.currentTarget.style.boxShadow = '0 2px 6px rgba(15,23,42,0.12)'; }}
        >
          <svg
            width="18" height="18" viewBox="0 0 18 18"
            style={{ transform: `rotate(${-bearing}deg)`, transition: 'transform 0.1s ease' }}
          >
            <polygon points="9,2 11,9 9,8 7,9" fill="#F87171" opacity="0.85" />
            <polygon points="9,16 11,9 9,10 7,9" fill="#CBD5E1" />
            <circle cx="9" cy="9" r="1.2" fill="#94A3B8" />
          </svg>
        </button>


        {/* Zoom in / out */}
        {[{ label: '+', action: 'in' }, { label: '−', action: 'out' }].map(({ label, action }) => (
          <button
            key={action}
            onClick={() => {
              if (!mapRef.current) return;
              action === 'in'
                ? mapRef.current.zoomIn({ duration: 200 })
                : mapRef.current.zoomOut({ duration: 200 });
            }}
            style={{
              width: 32, height: 32,
              background: 'rgba(255,255,255,0.96)',
              border: '1px solid #E2E8F0', borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
              fontSize: 18, fontWeight: 400, color: '#1C2B45',
              boxShadow: '0 2px 6px rgba(15,23,42,0.12)',
              transition: 'background 0.15s, box-shadow 0.15s',
              lineHeight: 1,
            }}
            onMouseOver={e => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.boxShadow = '0 4px 10px rgba(15,23,42,0.18)'; }}
            onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.96)'; e.currentTarget.style.boxShadow = '0 2px 6px rgba(15,23,42,0.12)'; }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}



