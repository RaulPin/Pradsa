'use strict';

const express = require('express');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const db = require('../database');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(auth, requireRole('admin'));

function getAttendance(start, end) {
  return db.prepare(`
    SELECT
      a.date,
      u.name  AS employee_name,
      u.email AS employee_email,
      e.department,
      e.position,
      a.clock_in,
      a.clock_out,
      a.clock_in_lat,
      a.clock_in_lng,
      a.notes,
      ROUND(
        CASE WHEN a.clock_in IS NOT NULL AND a.clock_out IS NOT NULL
          THEN (julianday(a.clock_out) - julianday(a.clock_in)) * 24
          ELSE NULL
        END, 2
      ) AS hours_worked
    FROM attendance a
    JOIN users u ON u.id = a.employee_id
    LEFT JOIN employees e ON e.user_id = a.employee_id
    WHERE a.date BETWEEN ? AND ?
    ORDER BY a.date DESC, u.name ASC
  `).all(start, end);
}

function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(str) {
  if (!str) return '—';
  return new Date(str + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

// GET /api/reports/attendance/excel?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/attendance/excel', async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const start = req.query.start || today;
  const end   = req.query.end   || today;

  const rows = getAttendance(start, end);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Pradsa';
  const ws = wb.addWorksheet('Asistencia');

  // Header styling
  const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
  const headerFont = { color: { argb: 'FFFFFFFF' }, bold: true, size: 11 };
  const border = {
    top: { style: 'thin' }, left: { style: 'thin' },
    bottom: { style: 'thin' }, right: { style: 'thin' },
  };

  ws.columns = [
    { header: 'Fecha',        key: 'date',     width: 14 },
    { header: 'Empleado',     key: 'name',     width: 24 },
    { header: 'Departamento', key: 'dept',     width: 18 },
    { header: 'Puesto',       key: 'pos',      width: 18 },
    { header: 'Entrada',      key: 'in',       width: 12 },
    { header: 'Salida',       key: 'out',      width: 12 },
    { header: 'Horas',        key: 'hours',    width: 10 },
    { header: 'Notas',        key: 'notes',    width: 28 },
  ];

  // Style header row
  ws.getRow(1).eachCell(cell => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.border = border;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  ws.getRow(1).height = 22;

  // Data rows
  rows.forEach((r, i) => {
    const row = ws.addRow({
      date:  formatDate(r.date),
      name:  r.employee_name,
      dept:  r.department || '—',
      pos:   r.position   || '—',
      in:    formatTime(r.clock_in),
      out:   formatTime(r.clock_out),
      hours: r.hours_worked != null ? `${r.hours_worked}h` : '—',
      notes: r.notes || '',
    });
    row.eachCell(cell => {
      cell.border = border;
      cell.alignment = { vertical: 'middle' };
      if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFF' } };
    });
    row.height = 18;
  });

  // Totals row
  const totalHours = rows.reduce((s, r) => s + (r.hours_worked || 0), 0);
  const totRow = ws.addRow({ date: 'TOTAL', hours: `${totalHours.toFixed(1)}h` });
  totRow.font = { bold: true };
  totRow.eachCell(cell => { cell.border = border; });

  // Title above table
  ws.spliceRows(1, 0, [`Reporte de Asistencia — ${formatDate(start)} al ${formatDate(end)}`]);
  ws.getRow(1).font = { bold: true, size: 13 };
  ws.getRow(1).height = 28;
  ws.mergeCells('A1:H1');

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="asistencia_${start}_${end}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

// GET /api/reports/attendance/pdf?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/attendance/pdf', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const start = req.query.start || today;
  const end   = req.query.end   || today;

  const rows = getAttendance(start, end);

  const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="asistencia_${start}_${end}.pdf"`);
  doc.pipe(res);

  // Title
  doc.fontSize(16).fillColor('#2563eb').text('Reporte de Asistencia — Pradsa', { align: 'center' });
  doc.fontSize(11).fillColor('#6b7280')
     .text(`${formatDate(start)} al ${formatDate(end)} · ${rows.length} registros`, { align: 'center' });
  doc.moveDown(0.75);

  // Table
  const cols = [
    { label: 'Fecha',        w: 80  },
    { label: 'Empleado',     w: 150 },
    { label: 'Departamento', w: 100 },
    { label: 'Entrada',      w: 65  },
    { label: 'Salida',       w: 65  },
    { label: 'Horas',        w: 55  },
    { label: 'Notas',        w: 200 },
  ];

  const rowH = 20;
  let x = 40;
  let y = doc.y;

  // Header
  doc.fillColor('#2563eb').rect(x, y, cols.reduce((s, c) => s + c.w, 0), rowH).fill();
  doc.fillColor('#ffffff').fontSize(9);
  let cx = x;
  cols.forEach(c => {
    doc.text(c.label, cx + 4, y + 5, { width: c.w - 8, ellipsis: true });
    cx += c.w;
  });
  y += rowH;

  // Rows
  doc.fontSize(8);
  rows.forEach((r, i) => {
    if (y > 520) { doc.addPage({ layout: 'landscape' }); y = 40; }
    const bg = i % 2 === 0 ? '#ffffff' : '#f8faff';
    doc.fillColor(bg).rect(x, y, cols.reduce((s, c) => s + c.w, 0), rowH).fill();

    const vals = [
      formatDate(r.date),
      r.employee_name,
      r.department || '—',
      formatTime(r.clock_in),
      formatTime(r.clock_out),
      r.hours_worked != null ? `${r.hours_worked}h` : '—',
      r.notes || '',
    ];

    doc.fillColor('#111827');
    cx = x;
    vals.forEach((v, j) => {
      doc.text(v, cx + 4, y + 6, { width: cols[j].w - 8, ellipsis: true });
      cx += cols[j].w;
    });

    // Row border
    doc.strokeColor('#e5e7eb').lineWidth(0.5)
       .rect(x, y, cols.reduce((s, c) => s + c.w, 0), rowH).stroke();

    y += rowH;
  });

  // Total
  const totalHours = rows.reduce((s, r) => s + (r.hours_worked || 0), 0);
  doc.moveDown(0.5).fontSize(10).fillColor('#111827')
     .text(`Total horas trabajadas: ${totalHours.toFixed(1)}h`, { align: 'right' });

  doc.end();
});

module.exports = router;
