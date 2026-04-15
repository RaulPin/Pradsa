'use strict';
const XLSX = require('xlsx');
const db   = require('../db/database');

function getDb() { return db; }

module.exports.downloadKpiExcel = function downloadKpiExcel(req, res) {
  const d = getDb();
  const now = new Date();
  const label = now.toISOString().slice(0, 10);

  /* ── 1. RESUMEN GENERAL ─────────────────────────────────────────────────── */
  const totals = d.prepare(`
    SELECT
      COUNT(*)                                          AS total,
      SUM(CASE WHEN status='completed'  THEN 1 ELSE 0 END) AS completadas,
      SUM(CASE WHEN status='cancelled'  THEN 1 ELSE 0 END) AS canceladas,
      SUM(CASE WHEN status='scheduled'  THEN 1 ELSE 0 END) AS programadas,
      SUM(CASE WHEN status='in_progress'THEN 1 ELSE 0 END) AS en_curso,
      SUM(CASE WHEN type='pyme'         THEN 1 ELSE 0 END) AS pyme,
      SUM(CASE WHEN type='fiduciario'   THEN 1 ELSE 0 END) AS fiduciario
    FROM interviews
  `).get();

  const avgDur = d.prepare(`
    SELECT ROUND(AVG(duration_seconds),0) AS avg_segundos
    FROM interview_sessions WHERE duration_seconds IS NOT NULL
  `).get();

  const totalPhotos = d.prepare(`SELECT COUNT(*) AS total FROM photos`).get();

  const completionRate = totals.total > 0
    ? ((totals.completadas / totals.total) * 100).toFixed(1) + '%'
    : '0%';

  const avgMin = avgDur.avg_segundos
    ? `${Math.floor(avgDur.avg_segundos / 60)}m ${avgDur.avg_segundos % 60}s`
    : 'N/A';

  const resumen = [
    ['KPI', 'Valor'],
    ['Total entrevistas',                totals.total],
    ['Entrevistas completadas',          totals.completadas],
    ['Entrevistas canceladas',           totals.canceladas],
    ['Entrevistas programadas',          totals.programadas],
    ['Entrevistas en curso',             totals.en_curso],
    ['Tasa de completitud',              completionRate],
    ['Duración promedio',                avgMin],
    ['Total fotos capturadas',           totalPhotos.total],
    ['Entrevistas tipo Pyme',            totals.pyme],
    ['Entrevistas tipo Fiduciario',      totals.fiduciario],
  ];

  /* ── 2. ENTREVISTAS DETALLE ─────────────────────────────────────────────── */
  const rows = d.prepare(`
    SELECT
      i.id,
      i.title,
      i.type,
      i.status,
      i.scheduled_at,
      i.interviewee_name,
      i.interviewee_email,
      i.interviewee_phone,
      i.interviewee_address,
      u.name  AS entrevistador,
      ROUND(COALESCE(s.duration_seconds,0)/60.0,1) AS duracion_min,
      (SELECT COUNT(*) FROM photos p WHERE p.interview_id=i.id) AS fotos,
      s.interviewee_location_address AS ubicacion
    FROM interviews i
    LEFT JOIN users u ON u.id = i.scheduled_by
    LEFT JOIN (
      SELECT interview_id, duration_seconds, interviewee_location_address
      FROM interview_sessions
      WHERE ended_at IS NOT NULL
      GROUP BY interview_id
    ) s ON s.interview_id = i.id
    ORDER BY i.scheduled_at DESC
  `).all();

  const STATUS_ES = { completed:'Completada', cancelled:'Cancelada', scheduled:'Programada', in_progress:'En curso' };
  const TYPE_ES   = { pyme:'Pyme', fiduciario:'Fiduciario' };

  const detalle = [
    ['Folio','Título','Tipo','Estado','Fecha programada','Entrevistado','Correo','Teléfono','Dirección','Entrevistador','Duración (min)','Fotos','Ubicación GPS'],
    ...rows.map(r => [
      r.id.slice(0,8).toUpperCase(),
      r.title,
      TYPE_ES[r.type]   || r.type,
      STATUS_ES[r.status] || r.status,
      r.scheduled_at ? new Date(r.scheduled_at).toLocaleString('es-MX') : '',
      r.interviewee_name,
      r.interviewee_email,
      r.interviewee_phone  || '',
      r.interviewee_address || '',
      r.entrevistador || '',
      r.duracion_min || 0,
      r.fotos || 0,
      r.ubicacion || '',
    ]),
  ];

  /* ── 3. POR ENTREVISTADOR ───────────────────────────────────────────────── */
  const porEntrevistador = d.prepare(`
    SELECT
      u.name                                               AS entrevistador,
      COUNT(i.id)                                          AS total,
      SUM(CASE WHEN i.status='completed'  THEN 1 ELSE 0 END) AS completadas,
      SUM(CASE WHEN i.status='cancelled'  THEN 1 ELSE 0 END) AS canceladas,
      ROUND(AVG(CASE WHEN s.duration_seconds IS NOT NULL THEN s.duration_seconds END)/60.0,1) AS duracion_prom_min,
      (SELECT COUNT(*) FROM photos p
       JOIN interviews ii ON ii.id=p.interview_id
       WHERE ii.scheduled_by=u.id) AS fotos_total
    FROM users u
    LEFT JOIN interviews i  ON i.scheduled_by = u.id
    LEFT JOIN interview_sessions s ON s.interview_id = i.id
    GROUP BY u.id ORDER BY total DESC
  `).all();

  const sheetEntrevistador = [
    ['Entrevistador','Total','Completadas','Canceladas','Duración prom. (min)','Total fotos'],
    ...porEntrevistador.map(r => [
      r.entrevistador, r.total, r.completadas, r.canceladas,
      r.duracion_prom_min || 0, r.fotos_total || 0,
    ]),
  ];

  /* ── 4. POR TIPO ────────────────────────────────────────────────────────── */
  const porTipo = d.prepare(`
    SELECT
      type,
      COUNT(*)                                             AS total,
      SUM(CASE WHEN status='completed'  THEN 1 ELSE 0 END) AS completadas,
      SUM(CASE WHEN status='cancelled'  THEN 1 ELSE 0 END) AS canceladas,
      ROUND(AVG(CASE WHEN s.duration_seconds IS NOT NULL THEN s.duration_seconds END)/60.0,1) AS duracion_prom_min
    FROM interviews i
    LEFT JOIN interview_sessions s ON s.interview_id = i.id
    GROUP BY type
  `).all();

  const sheetTipo = [
    ['Tipo','Total','Completadas','Canceladas','Duración prom. (min)'],
    ...porTipo.map(r => [
      TYPE_ES[r.type] || r.type, r.total, r.completadas, r.canceladas, r.duracion_prom_min || 0,
    ]),
  ];

  /* ── 5. POR PERÍODO (mes) ───────────────────────────────────────────────── */
  const porMes = d.prepare(`
    SELECT
      strftime('%Y-%m', scheduled_at) AS mes,
      COUNT(*)                        AS total,
      SUM(CASE WHEN status='completed'  THEN 1 ELSE 0 END) AS completadas,
      SUM(CASE WHEN status='cancelled'  THEN 1 ELSE 0 END) AS canceladas,
      SUM(CASE WHEN type='pyme'         THEN 1 ELSE 0 END) AS pyme,
      SUM(CASE WHEN type='fiduciario'   THEN 1 ELSE 0 END) AS fiduciario
    FROM interviews
    GROUP BY mes ORDER BY mes DESC
  `).all();

  const sheetMes = [
    ['Mes','Total','Completadas','Canceladas','Pyme','Fiduciario'],
    ...porMes.map(r => [r.mes, r.total, r.completadas, r.canceladas, r.pyme, r.fiduciario]),
  ];

  /* ── 6. ACTIVIDAD (día semana / hora) ───────────────────────────────────── */
  const DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

  const porDia = d.prepare(`
    SELECT strftime('%w', scheduled_at) AS dia_num, COUNT(*) AS total
    FROM interviews GROUP BY dia_num ORDER BY dia_num
  `).all();

  const porHora = d.prepare(`
    SELECT strftime('%H', scheduled_at) AS hora, COUNT(*) AS total
    FROM interviews GROUP BY hora ORDER BY hora
  `).all();

  const sheetActividad = [
    ['Día de la semana','Total entrevistas'],
    ...porDia.map(r => [DIAS[parseInt(r.dia_num)] || r.dia_num, r.total]),
    [], ['Hora del día','Total entrevistas'],
    ...porHora.map(r => [`${r.hora}:00`, r.total]),
  ];

  /* ── Construir libro Excel ──────────────────────────────────────────────── */
  const wb = XLSX.utils.book_new();

  const wsResumen = XLSX.utils.aoa_to_sheet(resumen);
  wsResumen['!cols'] = [{ wch: 30 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen KPI');

  const wsDetalle = XLSX.utils.aoa_to_sheet(detalle);
  wsDetalle['!cols'] = [8,30,12,14,20,25,28,15,35,20,14,8,35].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, wsDetalle, 'Entrevistas');

  const wsEnt = XLSX.utils.aoa_to_sheet(sheetEntrevistador);
  wsEnt['!cols'] = [{ wch: 25 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 20 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsEnt, 'Por Entrevistador');

  const wsTipo = XLSX.utils.aoa_to_sheet(sheetTipo);
  wsTipo['!cols'] = [{ wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsTipo, 'Por Tipo');

  const wsMes = XLSX.utils.aoa_to_sheet(sheetMes);
  wsMes['!cols'] = [{ wch: 10 }, { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 8 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsMes, 'Por Período');

  const wsAct = XLSX.utils.aoa_to_sheet(sheetActividad);
  wsAct['!cols'] = [{ wch: 20 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsAct, 'Actividad');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Disposition', `attachment; filename="KPI_EntrevistasPradsa_${label}.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
};
