'use client';


import { useState, useEffect, useRef } from 'react';
import { triggerTriage } from '@/lib/api';


const MONO = 'var(--font-mono)';


// ── PDF Export ────────────────────────────────────────────────────────
async function exportReport(wells) {
  const { default: jsPDF } = await import('jspdf');


  const doc    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW  = 210;
  const pageH  = 297;
  const margin = 16;
  const col    = pageW - margin * 2;
  let y        = margin;


  const NAVY  = [28, 43, 69];
  const GREEN = [26, 158, 107];
  const RISK_COLORS = {
    CRITICAL: [190, 18,  60],
    HIGH:     [194, 65,  12],
    MEDIUM:   [161, 98,   7],
    LOW:      [ 21,128,  61],
    MINIMAL:  [ 29, 78, 216],
    UNKNOWN:  [100,116, 139],
  };
  const ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'MINIMAL', 'UNKNOWN'];


  function setColor(rgb) { doc.setTextColor(...rgb); }
  function resetColor()  { doc.setTextColor(30, 30, 30); }
  function checkPage(needed = 20) {
    if (y + needed > pageH - 14) { doc.addPage(); y = margin; }
  }


  // ── Draw donut sector helper ──────────────────────────────────────
  // Approximates a filled pie wedge using a polygon of small arc steps
  function drawSector(cx, cy, r, startAngle, endAngle, color) {
    if (endAngle <= startAngle) return;
    doc.setFillColor(...color);
    const steps = Math.max(6, Math.ceil((endAngle - startAngle) / (Math.PI / 18)));
    const pts = [[cx, cy]];
    for (let i = 0; i <= steps; i++) {
      const a = startAngle + (endAngle - startAngle) * (i / steps);
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    doc.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) doc.lineTo(pts[i][0], pts[i][1]);
    doc.closePath();
    doc.fillEvenOdd();
  }


  function drawDonut(cx, cy, outerR, innerR, counts) {
    const total = counts.reduce((s, c) => s + c.count, 0);
    if (total === 0) return;
    let angle = -Math.PI / 2; // start at top
    counts.forEach(({ count, color }) => {
      if (count === 0) return;
      const sweep = (count / total) * 2 * Math.PI;
      drawSector(cx, cy, outerR, angle, angle + sweep, color);
      angle += sweep;
    });
    // Punch out the hole — white filled circle
    doc.setFillColor(255, 255, 255);
    doc.circle(cx, cy, innerR, 'F');
  }


  // ── Draw WellWatch logo ───────────────────────────────────────────
  function drawLogo(x, y, size) {
    const s = size / 32; // scale factor (designed at 32px)
    // Derrick triangle outline
    doc.setDrawColor(...GREEN);
    doc.setLineWidth(0.8 * s);
    // Legs of derrick
    doc.line(x + 16*s, y + 2*s,  x + 4*s,  y + 28*s);
    doc.line(x + 16*s, y + 2*s,  x + 28*s, y + 28*s);
    doc.line(x + 4*s,  y + 28*s, x + 28*s, y + 28*s);
    // Cross braces
    doc.setLineWidth(0.5 * s);
    doc.line(x + 9*s,  y + 16*s, x + 23*s, y + 16*s);
    doc.line(x + 12*s, y + 22*s, x + 20*s, y + 22*s);
    // IoT signal arcs (approximated as short lines radiating up-right)
    doc.setDrawColor(...GREEN);
    doc.setLineWidth(0.5 * s);
    const arcCx = x + 22*s, arcCy = y + 8*s;
    for (let i = 1; i <= 3; i++) {
      const r = i * 3 * s;
      const pts = [];
      for (let t = 0; t <= 8; t++) {
        const a = -Math.PI * 0.15 + (Math.PI * 0.3 * t / 8);
        pts.push([arcCx + r*Math.cos(a), arcCy + r*Math.sin(a)]);
      }
      for (let t = 0; t < pts.length - 1; t++) {
        doc.line(pts[t][0], pts[t][1], pts[t+1][0], pts[t+1][1]);
      }
    }
  }


  // ── Cover header ──────────────────────────────────────────────────
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageW, 42, 'F');


  // Logo icon in header
  drawLogo(margin, 4, 28);


  // WELLWATCH wordmark
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text('WELL', margin + 33, 17);
  const wellW = doc.getTextWidth('WELL');
  doc.setTextColor(...GREEN.map(v => Math.min(v + 80, 255)));
  doc.text('WATCH', margin + 33 + wellW, 17);


  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GREEN.map(v => Math.min(v + 60, 255)));
  doc.text('Abandoned Well Monitoring Report — Pennsylvania DEP', margin + 33, 25);


  doc.setFontSize(7.5);
  doc.setTextColor(160, 190, 215);
  doc.text(`Generated ${new Date().toLocaleString()}`, margin + 33, 33);


  y = 52;


  // ── Summary stats + Donut ─────────────────────────────────────────
  const triaged  = wells.filter(w => w.risk_score != null);
  const catCounts = ORDER.map(cat => ({
    cat,
    count: wells.filter(w => (w.risk_category || 'UNKNOWN') === cat).length,
    color: RISK_COLORS[cat],
  }));
  const avgScore = triaged.length
    ? (triaged.reduce((s, w) => s + w.risk_score, 0) / triaged.length).toFixed(1)
    : 'N/A';


  const boxH = 46;
  doc.setFillColor(244, 246, 249);
  doc.roundedRect(margin, y, col, boxH, 3, 3, 'F');


  // Donut on the right side of the summary box
  const donutCx = pageW - margin - 22;
  const donutCy = y + boxH / 2;
  drawDonut(donutCx, donutCy, 18, 10, catCounts);


  // "RISK DISTRIBUTION" label above donut
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(150, 160, 175);
  doc.text('RISK DIST.', donutCx, y + 5, { align: 'center' });


  // Stats in the left portion of the summary box
  const statsData = [
    { label: 'Total Wells',    value: String(wells.length),    color: NAVY },
    { label: 'Critical',       value: String(catCounts[0].count), color: RISK_COLORS.CRITICAL },
    { label: 'High',           value: String(catCounts[1].count), color: RISK_COLORS.HIGH },
    { label: 'Medium',         value: String(catCounts[2].count), color: RISK_COLORS.MEDIUM },
    { label: 'Low',            value: String(catCounts[3].count), color: RISK_COLORS.LOW },
    { label: 'Avg Score',      value: String(avgScore),         color: NAVY },
  ];
  const statW = (col - 48) / statsData.length; // leave 48mm for donut
  statsData.forEach((s, i) => {
    const sx = margin + i * statW + statW / 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...s.color);
    doc.text(s.value, sx, y + 22, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(120, 130, 145);
    doc.text(s.label.toUpperCase(), sx, y + 30, { align: 'center' });
  });


  // Donut legend (tiny colour dots + labels)
  const legendCats = catCounts.filter(c => c.count > 0);
  legendCats.forEach((c, i) => {
    const lx = donutCx - 14;
    const ly = y + boxH - 2 - (legendCats.length - i) * 5.5;
    doc.setFillColor(...c.color);
    doc.circle(lx, ly - 1, 1.2, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(90, 100, 115);
    doc.text(`${c.cat} (${c.count})`, lx + 3, ly);
  });


  y += boxH + 8;


  // ── Well entries ──────────────────────────────────────────────────
  const sorted = [...wells].sort((a, b) => {
    const ai = ORDER.indexOf(a.risk_category ?? 'UNKNOWN');
    const bi = ORDER.indexOf(b.risk_category ?? 'UNKNOWN');
    if (ai !== bi) return ai - bi;
    return (b.risk_score ?? 0) - (a.risk_score ?? 0);
  });


  let lastCat = null;


  sorted.forEach((well) => {
    const cat   = well.risk_category || 'UNKNOWN';
    const rc    = RISK_COLORS[cat] || RISK_COLORS.UNKNOWN;
    const score = well.risk_score != null ? Math.round(well.risk_score) : null;


    // Category header
    if (cat !== lastCat) {
      checkPage(12);
      y += 3;
      doc.setFillColor(...rc.map(v => Math.min(v + 195, 255)));
      doc.roundedRect(margin, y, col, 7, 1.5, 1.5, 'F');
      doc.setFillColor(...rc);
      doc.rect(margin, y, 2.5, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      setColor(rc);
      doc.text(
        `${cat}  ·  ${catCounts.find(c => c.cat === cat)?.count ?? 0} wells`,
        margin + 6, y + 5
      );
      resetColor();
      y += 10;
      lastCat = cat;
    }


    // ── Compact well card ──
    // Height: base 14mm, +5 if has action, +5 if has reasoning
    const hasAction   = !!well.recommended_action;
    const hasReasoning = !!well.gemini_reasoning;
    const cardH = 14 + (hasAction ? 5 : 0) + (hasReasoning ? 5 : 0);
    checkPage(cardH + 3);


    doc.setFillColor(250, 251, 253);
    doc.setDrawColor(...rc.map(v => Math.min(v + 160, 255)));
    doc.setLineWidth(0.25);
    doc.roundedRect(margin, y, col, cardH, 1.5, 1.5, 'FD');
    // Left accent bar
    doc.setFillColor(...rc);
    doc.rect(margin, y, 2, cardH, 'F');


    // Score badge (right side)
    if (score != null) {
      doc.setFillColor(...rc);
      doc.roundedRect(pageW - margin - 14, y + 2.5, 12, 8, 1.5, 1.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text(String(score), pageW - margin - 8, y + 8, { align: 'center' });
    }


    // Well name (row 1)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    resetColor();
    const nameMaxW = col - 22;
    const name = well.well_name || well.api_number;
    doc.text(name.length > 52 ? name.slice(0, 52) + '…' : name, margin + 4, y + 6.5);


    // API · County · State (row 2)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(120, 130, 145);
    const meta = [well.api_number, well.county && `${well.county} Co.`, well.state]
      .filter(Boolean).join('  ·  ');
    doc.text(meta, margin + 4, y + 11.5);


    let textY = y + 11.5;


    // Recommended action (row 3 if present)
    if (hasAction) {
      textY += 5;
      doc.setFontSize(6.5);
      doc.setTextColor(55, 65, 80);
      const action = well.recommended_action.length > 100
        ? well.recommended_action.slice(0, 100) + '…'
        : well.recommended_action;
      doc.text(`⚡ ${action}`, margin + 4, textY, { maxWidth: col - 20 });
    }


    // Gemini reasoning (row 4 if present)
    if (hasReasoning) {
      textY += 5;
      doc.setFontSize(6);
      doc.setTextColor(95, 75, 155);
      const reasoning = well.gemini_reasoning.length > 115
        ? well.gemini_reasoning.slice(0, 115) + '…'
        : well.gemini_reasoning;
      doc.text(reasoning, margin + 4, textY, { maxWidth: col - 20 });
    }


    y += cardH + 2.5;
    resetColor();
  });


  // ── Footer on every page ──────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFillColor(240, 243, 248);
    doc.rect(0, pageH - 9, pageW, 9, 'F');
    // Mini logo mark in footer
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...NAVY);
    doc.text('WELL', margin, pageH - 3.5);
    const fw = doc.getTextWidth('WELL');
    doc.setTextColor(...GREEN);
    doc.text('WATCH', margin + fw, pageH - 3.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150, 160, 175);
    doc.text(' · Pennsylvania Abandoned Well Monitoring System', margin + fw + doc.getTextWidth('WATCH'), pageH - 3.5);
    doc.text(`Page ${i} of ${pageCount}`, pageW - margin, pageH - 3.5, { align: 'right' });
  }


  const filename = `wellwatch-report-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}


// ── Bulk Triage — batches of 3 for ~3x speedup without hitting rate limits ──
async function runBulkTriage(wells, onProgress, onComplete) {
  const targets = wells.filter(w =>
    w.risk_category === 'CRITICAL' || w.risk_category === 'HIGH'
  );
  if (targets.length === 0) return;


  const BATCH = 3;
  let done = 0;
  const results = [];


  for (let i = 0; i < targets.length; i += BATCH) {
    const batch = targets.slice(i, i + BATCH);
    const settled = await Promise.allSettled(
      batch.map(w => triggerTriage(w.api_number))
    );
    settled.forEach((s, idx) => {
      if (s.status === 'fulfilled') {
        results.push({ api_number: batch[idx].api_number, ...s.value });
      }
    });
    done = Math.min(i + BATCH, targets.length);
    onProgress(done, targets.length);
  }


  onComplete(results);
}


// ── Toolbar Component ─────────────────────────────────────────────────
export default function Toolbar({ wells, onBulkTriageComplete }) {
  const [exporting, setExporting]   = useState(false);
  const [triaging, setTriaging]     = useState(false);
  const [progress, setProgress]     = useState({ done: 0, total: 0 });
  const [triageDone, setTriageDone] = useState(false);


  // ── Auto-triage state ─────────────────────────────────────────────
  const [autoOn, setAutoOn]       = useState(false);
  const [autoPending, setAutoPending] = useState(0);
  const autoRunning = useRef(false);
  const wellsRef    = useRef(wells);
  useEffect(() => { wellsRef.current = wells; }, [wells]);


  useEffect(() => {
    if (!autoOn) { autoRunning.current = false; return; }
    autoRunning.current = true;


    async function runNext() {
      if (!autoRunning.current) return;
      const untriaged = wellsRef.current.filter(
        w => !w.risk_category || w.risk_category === 'UNKNOWN'
      );
      if (untriaged.length === 0) {
        autoRunning.current = false;
        setAutoOn(false);
        setAutoPending(0);
        return;
      }
      setAutoPending(untriaged.length);
      try {
        const result = await triggerTriage(untriaged[0].api_number);
        if (autoRunning.current) onBulkTriageComplete([{ api_number: untriaged[0].api_number, ...result }]);
      } catch (_) { /* skip failed well, continue loop */ }
      if (autoRunning.current) setTimeout(runNext, 600);
    }


    runNext();
    return () => { autoRunning.current = false; };
  }, [autoOn]);


  const critHighCount = wells.filter(w =>
    w.risk_category === 'CRITICAL' || w.risk_category === 'HIGH'
  ).length;


  async function handleExport() {
    if (exporting || wells.length === 0) return;
    setExporting(true);
    try { await exportReport(wells); }
    finally { setExporting(false); }
  }


  async function handleBulkTriage() {
    if (triaging || critHighCount === 0) return;
    setTriaging(true);
    setTriageDone(false);
    setProgress({ done: 0, total: critHighCount });
    await runBulkTriage(
      wells,
      (done, total) => setProgress({ done, total }),
      (results) => {
        setTriaging(false);
        setTriageDone(true);
        onBulkTriageComplete(results);
        setTimeout(() => setTriageDone(false), 4000);
      }
    );
  }


  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
      {/* Auto-Triage toggle */}
      <button
        onClick={() => setAutoOn(o => !o)}
        title={autoOn ? 'Stop auto-triaging untriaged wells' : 'Passively triage all gray (untriaged) wells in the background'}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '4px 10px',
          background: autoOn ? '#EFF6FF' : 'var(--surface)',
          border: autoOn ? '1px solid #93C5FD' : '1px solid var(--border)',
          borderRadius: 6,
          cursor: 'pointer',
          height: 28,
          transition: 'all 0.2s ease',
        }}
        onMouseOver={e => { if (!autoOn) e.currentTarget.style.borderColor = '#1C2B45'; }}
        onMouseOut={e => { if (!autoOn) e.currentTarget.style.borderColor = 'var(--border)'; }}
      >
        {/* Pulsing dot when active */}
        <span style={{
          display: 'inline-block',
          width: 6, height: 6, borderRadius: '50%',
          background: autoOn ? '#3B82F6' : '#94A3B8',
          animation: autoOn ? 'blink 1.2s ease infinite' : 'none',
          flexShrink: 0,
        }} />
        <span style={{
          fontFamily: MONO, fontSize: 9, fontWeight: 600, letterSpacing: '0.07em',
          color: autoOn ? '#1D4ED8' : 'var(--text-2)', whiteSpace: 'nowrap',
        }}>
          {autoOn
            ? autoPending > 0 ? `AUTO · ${autoPending} left` : 'AUTO · scanning…'
            : 'AUTO TRIAGE'}
        </span>
      </button>
      <button
        onClick={handleBulkTriage}
        disabled={triaging || critHighCount === 0}
        title={`Run Gemini triage on all ${critHighCount} Critical + High wells`}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '4px 10px',
          background: triageDone ? '#D1FAE5' : triaging ? 'var(--surface-2)' : '#1C2B45',
          border: triageDone ? '1px solid #6EE7B7' : '1px solid transparent',
          borderRadius: 6,
          cursor: triaging || critHighCount === 0 ? 'not-allowed' : 'pointer',
          opacity: critHighCount === 0 ? 0.4 : 1,
          transition: 'all 0.2s ease',
          height: 28,
        }}
      >
        <span style={{ fontSize: 10 }}>{triageDone ? '✓' : triaging ? '⏳' : '⚡'}</span>
        <span style={{
          fontFamily: MONO, fontSize: 9, fontWeight: 600, letterSpacing: '0.07em',
          color: triageDone ? '#065F46' : triaging ? 'var(--text-3)' : 'white',
          whiteSpace: 'nowrap',
        }}>
          {triageDone ? 'DONE' : triaging ? `${progress.done}/${progress.total}` : `BULK TRIAGE (${critHighCount})`}
        </span>
      </button>


      {/* Export PDF */}
      <button
        onClick={handleExport}
        disabled={exporting || wells.length === 0}
        title="Export full well report as PDF"
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '4px 10px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          cursor: exporting || wells.length === 0 ? 'not-allowed' : 'pointer',
          opacity: wells.length === 0 ? 0.4 : 1,
          height: 28,
          transition: 'border-color 0.15s',
        }}
        onMouseOver={e => { if (!exporting) e.currentTarget.style.borderColor = '#1C2B45'; }}
        onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}
      >
        <span style={{ fontSize: 10 }}>📄</span>
        <span style={{
          fontFamily: MONO, fontSize: 9, fontWeight: 600, letterSpacing: '0.07em',
          color: 'var(--text-2)', whiteSpace: 'nowrap',
        }}>
          {exporting ? 'EXPORTING…' : 'PDF'}
        </span>
      </button>
    </div>
  );
}



