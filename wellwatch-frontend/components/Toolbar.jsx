'use client';


import { useState } from 'react';
import { triggerTriage } from '@/lib/api';


const MONO = 'var(--font-mono)';


// ── PDF Export ────────────────────────────────────────────────────────
async function exportReport(wells) {
  const { default: jsPDF } = await import('jspdf');


  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210;
  const pageH = 297;
  const margin = 18;
  const col = pageW - margin * 2;
  let y = margin;


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


  function setColor(rgb) { doc.setTextColor(...rgb); }
  function resetColor()  { doc.setTextColor(30, 30, 30); }


  function checkPage(needed = 20) {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  }


  // ── Cover header ──────────────────────────────────────────────────
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageW, 38, 'F');


  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.text('WELLWATCH', margin, 18);


  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...GREEN.map(v => Math.min(v + 60, 255)));
  doc.text('Abandoned Well Monitoring Report — Pennsylvania DEP', margin, 26);


  doc.setFontSize(8);
  doc.setTextColor(180, 200, 220);
  doc.text(`Generated ${new Date().toLocaleString()}`, margin, 33);


  y = 48;


  // ── Summary stats ─────────────────────────────────────────────────
  const triaged   = wells.filter(w => w.risk_score != null);
  const critical  = wells.filter(w => w.risk_category === 'CRITICAL');
  const high      = wells.filter(w => w.risk_category === 'HIGH');
  const medium    = wells.filter(w => w.risk_category === 'MEDIUM');
  const avgScore  = triaged.length
    ? (triaged.reduce((s, w) => s + w.risk_score, 0) / triaged.length).toFixed(1)
    : 'N/A';


  doc.setFillColor(244, 246, 249);
  doc.roundedRect(margin, y, col, 28, 3, 3, 'F');


  const stats = [
    { label: 'Total Wells',    value: wells.length },
    { label: 'Critical',       value: critical.length,  color: RISK_COLORS.CRITICAL },
    { label: 'High',           value: high.length,      color: RISK_COLORS.HIGH },
    { label: 'Medium',         value: medium.length,    color: RISK_COLORS.MEDIUM },
    { label: 'Avg Risk Score', value: avgScore },
  ];


  const colW = col / stats.length;
  stats.forEach((s, i) => {
    const x = margin + i * colW + colW / 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    s.color ? setColor(s.color) : setColor(NAVY);
    doc.text(String(s.value), x, y + 12, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(120, 130, 145);
    doc.text(s.label.toUpperCase(), x, y + 20, { align: 'center' });
  });


  y += 36;


  // ── Well entries ──────────────────────────────────────────────────
  const ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'MINIMAL', 'UNKNOWN'];
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
      checkPage(16);
      y += 4;
      doc.setFillColor(...rc);
      doc.rect(margin, y, 3, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      setColor(rc);
      doc.text(`${cat}  (${wells.filter(w => (w.risk_category || 'UNKNOWN') === cat).length} wells)`, margin + 6, y + 6);
      resetColor();
      y += 14;
      lastCat = cat;
    }


    // Well card
    const cardH = well.gemini_reasoning ? 38 : 22;
    checkPage(cardH + 4);


    doc.setFillColor(250, 251, 253);
    doc.setDrawColor(...rc);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, y, col, cardH, 2, 2, 'FD');
    doc.setFillColor(...rc);
    doc.rect(margin, y, 2.5, cardH, 'F');


    // Score badge
    if (score != null) {
      doc.setFillColor(...rc);
      doc.roundedRect(pageW - margin - 18, y + 4, 16, 10, 2, 2, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      doc.text(String(score), pageW - margin - 10, y + 11, { align: 'center' });
    }


    // Well name
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    resetColor();
    doc.text(well.well_name || well.api_number, margin + 6, y + 8);


    // API + location
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(110, 120, 135);
    const meta = [well.api_number, well.county && `${well.county} Co.`, well.state].filter(Boolean).join('  ·  ');
    doc.text(meta, margin + 6, y + 15);


    // Recommended action
    if (well.recommended_action) {
      doc.setFontSize(7.5);
      doc.setTextColor(60, 70, 85);
      const action = well.recommended_action.length > 90
        ? well.recommended_action.slice(0, 90) + '…'
        : well.recommended_action;
      doc.text(`Action: ${action}`, margin + 6, y + 22);
    }


    // Gemini reasoning
    if (well.gemini_reasoning) {
      doc.setFontSize(7);
      doc.setTextColor(100, 80, 160);
      const reasoning = well.gemini_reasoning.length > 120
        ? well.gemini_reasoning.slice(0, 120) + '…'
        : well.gemini_reasoning;
      doc.text(reasoning, margin + 6, y + 30, { maxWidth: col - 28 });
    }


    y += cardH + 4;
    resetColor();
  });


  // ── Footer on every page ──────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFillColor(244, 246, 249);
    doc.rect(0, pageH - 10, pageW, 10, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(150, 160, 175);
    doc.text('WellWatch · Pennsylvania Abandoned Well Monitoring System', margin, pageH - 4);
    doc.text(`Page ${i} of ${pageCount}`, pageW - margin, pageH - 4, { align: 'right' });
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
      {/* Bulk Triage */}
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



