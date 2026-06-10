'use strict';
const fs   = require('fs');
const path = require('path');
const db   = require('../db/database');
const config = require('../config');

function val(r, key, fallback = '') {
  return (r && r[key]) ? String(r[key]) : fallback;
}

function chk(r, key, expected) {
  return (r && r[key] === expected) ? '☑' : '☐';
}

function photoB64(interviewId, filename) {
  if (!filename) return null;
  const filePath = path.join(path.resolve(config.uploadDir), interviewId, filename);
  if (!fs.existsSync(filePath)) return null;
  try {
    const buf = fs.readFileSync(filePath);
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch { return null; }
}

function generateFiduciarioReport(req, res) {
  const { id } = req.params;
  const { userId, role } = req.user;

  const interview = db.prepare('SELECT * FROM interviews WHERE id=?').get(id);
  if (!interview) return res.status(404).send('Entrevista no encontrada');
  if (role !== 'admin' && interview.scheduled_by !== userId) {
    return res.status(403).send('Acceso denegado');
  }

  const session      = db.prepare('SELECT * FROM interview_sessions WHERE interview_id=? ORDER BY created_at DESC LIMIT 1').get(id);
  const qRow         = db.prepare('SELECT * FROM questionnaire_responses WHERE interview_id=?').get(id);
  const photosAll    = db.prepare('SELECT * FROM photos WHERE interview_id=? ORDER BY captured_at').all(id);
  const interviewer  = db.prepare('SELECT name, email FROM users WHERE id=?').get(interview.scheduled_by);

  let r = {};
  if (qRow?.responses) {
    try { r = JSON.parse(qRow.responses); } catch { r = {}; }
  }

  // Construir coordenadas
  const geoCoords = session?.interviewee_location_lat
    ? `${session.interviewee_location_lat.toFixed(6)}, ${session.interviewee_location_lng.toFixed(6)}`
    : '';
  const geoDisplay = val(r, 'url_geolocalizacion', geoCoords || '—');

  // Fotos asignadas a slots
  const slotImgs = {};
  ['foto1', 'foto2', 'foto3', 'foto4'].forEach((slot) => {
    const filename = val(r, slot);
    slotImgs[slot] = filename ? photoB64(id, filename) : null;
  });

  const fecha = (() => {
    const d = val(r, 'fecha_dia'); const m = val(r, 'fecha_mes'); const a = val(r, 'fecha_anio');
    return d && m && a ? `${d} / ${m} / ${a}` : (new Date(interview.scheduled_at).toLocaleDateString('es-MX'));
  })();

  const photoSlotHTML = (slotKey, label) => {
    const img = slotImgs[slotKey];
    return `
      <div class="photo-cell">
        <div class="photo-label">${label}</div>
        <div class="photo-box">
          ${img ? `<img src="${img}" alt="${label}" />` : '<div class="photo-empty">Sin fotografía</div>'}
        </div>
      </div>`;
  };

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>Reporte de Visita Ocular – Fiduciario</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 10pt; color: #111; background: #fff; }

  .page { width: 210mm; min-height: 297mm; padding: 14mm 14mm 10mm; margin: 0 auto; }
  @media print {
    .no-print { display: none !important; }
    .page { margin: 0; padding: 10mm 12mm; page-break-after: always; }
    .page:last-child { page-break-after: avoid; }
  }

  /* Print button */
  .no-print {
    position: fixed; top: 12px; right: 12px; z-index: 999;
    display: flex; gap: 8px;
  }
  .btn-print {
    background: #1e3a5f; color: #fff; border: none; border-radius: 8px;
    padding: 10px 20px; font-size: 13px; font-weight: 700; cursor: pointer;
  }
  .btn-print:hover { background: #2563eb; }

  /* Header */
  .report-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6mm; }
  .report-title { font-size: 13pt; font-weight: 700; text-align: right; }
  .report-brand { font-size: 18pt; font-weight: 900; color: #1e3a5f; letter-spacing: -1px; }

  /* Sections */
  .section { border: 1px solid #999; margin-bottom: 3mm; }
  .section-inner { padding: 3mm 4mm; }
  .section-title { font-weight: 700; font-size: 9pt; background: #f0f0f0; padding: 2mm 4mm; border-bottom: 1px solid #999; }

  /* Field rows */
  .field-row { display: flex; gap: 6mm; margin-bottom: 2mm; flex-wrap: wrap; }
  .field-item { flex: 1; min-width: 60mm; }
  .field-label { font-size: 7.5pt; color: #555; margin-bottom: 1mm; }
  .field-value { border-bottom: 1px solid #333; min-height: 5mm; padding-bottom: 1mm; font-size: 9.5pt; }

  /* Checkboxes */
  .check-row { display: flex; gap: 8mm; flex-wrap: wrap; margin: 2mm 0; align-items: center; }
  .check-row label { font-size: 9pt; display: flex; align-items: center; gap: 2mm; white-space: nowrap; }
  .check-prefix { font-size: 8.5pt; color: #333; margin-right: 3mm; }

  /* Textarea */
  .text-area-box { border: 1px solid #999; min-height: 20mm; padding: 2mm; font-size: 9pt; white-space: pre-wrap; word-break: break-word; }

  /* Signature boxes */
  .sign-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
  .sign-box { border: 1px solid #999; min-height: 28mm; padding: 2mm; }
  .sign-label { font-size: 7.5pt; color: #555; margin-top: 2mm; border-top: 1px solid #999; padding-top: 1mm; }

  /* Geo section */
  .geo-box { border: 1px solid #999; min-height: 35mm; margin-bottom: 3mm; padding: 3mm; font-size: 8.5pt; color: #555; }

  /* Privacy notice */
  .privacy { font-size: 6.5pt; color: #555; line-height: 1.4; border: 1px solid #ccc; padding: 2mm 3mm; margin: 3mm 0; }

  /* Photos page */
  .photos-title { text-align: center; font-size: 13pt; font-weight: 700; margin-bottom: 6mm; }
  .photos-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border-top: 1px solid #333; border-left: 1px solid #333; }
  .photo-cell { border-right: 1px solid #333; border-bottom: 1px solid #333; }
  .photo-label { font-size: 7.5pt; font-weight: 700; padding: 2mm 3mm; border-bottom: 1px solid #ccc; background: #fafafa; }
  .photo-box { width: 100%; height: 85mm; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #f5f5f5; }
  .photo-box img { width: 100%; height: 100%; object-fit: cover; }
  .photo-empty { color: #aaa; font-size: 8.5pt; }
  .photo-note { font-size: 7pt; color: #777; text-align: center; padding: 1.5mm 3mm; border-top: 1px solid #eee; }

  .footer-line { display: flex; justify-content: space-between; margin-top: 4mm; font-size: 8pt; border-top: 1px solid #ccc; padding-top: 2mm; }
</style>
</head>
<body>

<div class="no-print">
  <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
  <button class="btn-print" style="background:#475569;" onclick="window.close()">Cerrar</button>
</div>

<!-- ══════════════════════════════════════════════════════
     PÁGINA 1 – DATOS GENERALES
══════════════════════════════════════════════════════ -->
<div class="page">

  <div class="report-header">
    <div class="report-brand">FieldCheck</div>
    <div class="report-title">Reporte de Visita Ocular</div>
  </div>

  <!-- Encabezado -->
  <div class="section">
    <div class="section-inner">
      <div class="field-row">
        <div class="field-item" style="max-width:35mm;"><div class="field-label">Motivo de visita</div><div class="field-value"><strong>FIDUCIARIO</strong></div></div>
        <div class="field-item"><div class="field-label">Ciudad</div><div class="field-value">${val(r,'ciudad')}</div></div>
        <div class="field-item" style="max-width:50mm;"><div class="field-label">Fecha</div><div class="field-value">${fecha}</div></div>
      </div>
      <div class="field-row">
        <div class="field-item"><div class="field-label">Número de fideicomiso</div><div class="field-value">${val(r,'numero_fideicomiso')}</div></div>
        <div class="field-item">
          <div class="field-label">Tipo de visita</div>
          <div class="check-row">
            <label>${chk(r,'tipo_visita','fisica')} Física</label>
            <label>${chk(r,'tipo_visita','digital')} Digital</label>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Tipo de persona -->
  <div class="section">
    <div class="section-inner">
      <div class="field-label">Tipo de persona</div>
      <div class="check-row">
        <label>${chk(r,'tipo_persona','fisica')} Persona física</label>
        <label>${chk(r,'tipo_persona','fisica_empresarial')} Persona física con actividad empresarial</label>
        <label>${chk(r,'tipo_persona','moral')} Persona Moral</label>
      </div>
    </div>
  </div>

  <!-- Identificación -->
  <div class="section">
    <div class="section-inner">
      <div class="field-row">
        <div class="field-item"><div class="field-label">Primer Apellido, Segundo Apellido y Nombre(s)</div><div class="field-value">${val(r,'apellidos_nombres')}</div></div>
      </div>
      <div class="field-row">
        <div class="field-item"><div class="field-label">Denominación o razón social (sin abreviaturas)</div><div class="field-value">${val(r,'denominacion_razon_social')}</div></div>
      </div>
      <div class="field-label" style="margin-top:2mm;">Nombre de la persona que proporciona la información:</div>
      <div class="field-row">
        <div class="field-item"><div class="field-label">Nombre completo y sin abreviaturas</div><div class="field-value">${val(r,'informante_nombre')}</div></div>
        <div class="field-item" style="max-width:45mm;"><div class="field-label">Cargo / Puesto / Parentesco</div><div class="field-value">${val(r,'informante_cargo')}</div></div>
        <div class="field-item" style="max-width:30mm;"><div class="field-label">ID</div><div class="field-value">${val(r,'informante_id_tipo')}</div></div>
        <div class="field-item" style="max-width:35mm;"><div class="field-label">Número de ID</div><div class="field-value">${val(r,'informante_id_numero')}</div></div>
      </div>
    </div>
  </div>

  <!-- Domicilio -->
  <div class="section">
    <div class="section-inner">
      <div class="check-row">
        <span class="check-prefix">Domicilio verificado en la visita:</span>
        <label>${chk(r,'domicilio_tipo','fiscal')} Fiscal</label>
        <label>${chk(r,'domicilio_tipo','operativo_comercial')} Operativo / Comercial</label>
        <label>${chk(r,'domicilio_tipo','ambos')} Ambos</label>
        <label>${chk(r,'domicilio_tipo','particular')} Domicilio Particular</label>
      </div>
      <div class="field-row" style="margin-top:3mm;">
        <div class="field-item"><div class="field-label">Calle y Número exterior e interior</div><div class="field-value">${val(r,'domicilio_calle')}</div></div>
        <div class="field-item"><div class="field-label">Colonia / Urbanización</div><div class="field-value">${val(r,'domicilio_colonia')}</div></div>
        <div class="field-item"><div class="field-label">Delegación / Municipio / Ciudad / Población</div><div class="field-value">${val(r,'domicilio_municipio')}</div></div>
      </div>
      <div class="field-row">
        <div class="field-item"><div class="field-label">Entre las calles</div><div class="field-value">${val(r,'domicilio_entre_calles')}</div></div>
        <div class="field-item" style="max-width:50mm;"><div class="field-label">Estado</div><div class="field-value">${val(r,'domicilio_estado')}</div></div>
      </div>
      <div class="field-row">
        <div class="field-item"><div class="field-label">Teléfono(s)</div><div class="field-value">${val(r,'telefono')}</div></div>
        <div class="field-item"><div class="field-label">Correo electrónico</div><div class="field-value">${val(r,'correo')}</div></div>
      </div>
    </div>
  </div>

  <!-- Actividad y características -->
  <div class="section">
    <div class="section-inner">
      <div class="field-row">
        <div class="field-item"><div class="field-label">Actividad económica preponderante</div><div class="field-value">${val(r,'actividad_economica')}</div></div>
        <div class="field-item" style="max-width:50mm;"><div class="field-label">Tiempo de residir en el inmueble</div><div class="field-value">${val(r,'tiempo_residencia')} año(s)</div></div>
      </div>
      <div class="check-row">
        <span class="check-prefix">¿Se pudo ingresar al inmueble?</span>
        <label>${chk(r,'ingreso_inmueble','si')} Sí</label>
        <label>${chk(r,'ingreso_inmueble','no')} No</label>
        <span>Causa: ${val(r,'ingreso_inmueble_causa','—')}</span>
      </div>
      <div class="check-row">
        <span class="check-prefix">El inmueble que ocupa es:</span>
        <label>${chk(r,'tenencia_inmueble','propio')} Propio</label>
        <label>${chk(r,'tenencia_inmueble','rentado')} Rentado</label>
        <label>${chk(r,'tenencia_inmueble','otros')} Otros</label>
        <span>Especifique: ${val(r,'tenencia_especifique','—')}</span>
      </div>
      <div class="check-row">
        <span class="check-prefix">Tipo de inmueble:</span>
        <label>${chk(r,'tipo_inmueble','oficina')} Oficina</label>
        <label>${chk(r,'tipo_inmueble','local_comercial')} Local Comercial</label>
        <label>${chk(r,'tipo_inmueble','fabrica')} Fábrica</label>
        <label>${chk(r,'tipo_inmueble','bodega')} Bodega</label>
        <label>${chk(r,'tipo_inmueble','oficina_virtual')} Oficina virtual</label>
        <label>${chk(r,'tipo_inmueble','casa_adaptada')} Casa Adaptada</label>
        <label>${chk(r,'tipo_inmueble','casa_hab')} Casa/Hab</label>
        <label>${chk(r,'tipo_inmueble','departamento')} Departamento</label>
        <label>${chk(r,'tipo_inmueble','otro')} Otro</label>
      </div>
      <div class="check-row">
        <span class="check-prefix">Condición del inmueble:</span>
        <label>${chk(r,'condicion_inmueble','buen_estado')} En buen estado</label>
        <label>${chk(r,'condicion_inmueble','descuidado')} Descuidado</label>
        <label>${chk(r,'condicion_inmueble','abandonado')} Abandonado</label>
      </div>
      <div class="check-row">
        <span class="check-prefix">Zona socioeconómica:</span>
        <label>${chk(r,'zona_socioeconomica','bajo')} Bajo</label>
        <label>${chk(r,'zona_socioeconomica','medio')} Medio</label>
        <label>${chk(r,'zona_socioeconomica','alto')} Alto</label>
      </div>
      <div class="check-row">
        <span class="check-prefix">¿Logotipo/anuncio en exterior?</span>
        <label>${chk(r,'logotipo_exterior','si')} Sí</label>
        <label>${chk(r,'logotipo_exterior','no')} No</label>
        <span>¿Por qué? ${val(r,'logotipo_exterior_porque','—')}</span>
      </div>
      <div class="check-row">
        <span class="check-prefix">¿Autorizó fotografías?</span>
        <label>${chk(r,'autorizo_fotografias','si')} Sí</label>
        <label>${chk(r,'autorizo_fotografias','no')} No</label>
        <span>¿Por qué? ${val(r,'autorizo_fotografias_porque','—')}</span>
      </div>
    </div>
  </div>

</div><!-- /page 1 -->

<!-- ══════════════════════════════════════════════════════
     PÁGINA 2 – OBSERVACIONES Y FIRMAS
══════════════════════════════════════════════════════ -->
<div class="page">

  <div class="section">
    <div class="section-inner">
      <div class="check-row">
        <span class="check-prefix">¿Se observan empleados?</span>
        <label>${chk(r,'empleados','si')} Sí</label>
        <label>${chk(r,'empleados','no')} No</label>
        <span>¿Por qué? ${val(r,'empleados_porque','—')}</span>
      </div>
      <div class="check-row" style="margin-top:2mm;">
        <span class="check-prefix">¿Características acordes a la actividad declarada?</span>
        <label>${chk(r,'instalaciones_acorde','si')} Sí</label>
        <label>${chk(r,'instalaciones_acorde','no')} No</label>
      </div>
      <div class="field-row" style="margin-top:2mm;">
        <div class="field-item"><div class="field-label">Describir el por qué</div><div class="field-value">${val(r,'instalaciones_porque')}</div></div>
      </div>
      <div class="field-row" style="margin-top:2mm;">
        <div class="field-item"><div class="field-label">Describa brevemente la operación</div><div class="field-value" style="min-height:10mm;">${val(r,'descripcion_operacion')}</div></div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Comentarios del verificador</div>
    <div class="section-inner">
      <div class="text-area-box" style="min-height:30mm;">${val(r,'comentarios_verificador')}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Croquis, Geolocalización y URL</div>
    <div class="section-inner">
      <div class="geo-box">(Croquis o mapa del inmueble)</div>
      <div class="field-row">
        <div class="field-item"><div class="field-label">URL o Coordenada de Geolocalización</div><div class="field-value">${geoDisplay}</div></div>
      </div>
    </div>
  </div>

  <div class="privacy">
    Banco Mercantil del Norte, S.A., Institución de Banca Múltiple, Grupo Financiero Banorte, con domicilio en Avenida Revolución 3000 Colonia La Primavera, Monterrey, Nuevo León, Código Postal 64830 para oír y recibir notificaciones, quien es el responsable del uso y protección de sus datos personales y al respecto le informa lo siguiente: Los datos personales que recabados de usted, los utilizaremos para las finalidades establecidas en nuestro propio Aviso de privacidad, ponemos a su disposición el Aviso de Privacidad Integral previo a haber asentado sus datos personales en esta solicitud, cuyo texto se encuentra en www.banorte.com, en donde le damos a conocer más información acerca del tratamiento de su información y los derechos que usted puede hacer valer. En este acto, el Titular de los Datos Personales otorga su consentimiento de manera expresa para que Banorte de tratamiento a sus Datos Personales.
    <br><br>Nombre y firma: _______________________________________
  </div>

  <div style="margin-top:4mm;font-size:8.5pt;margin-bottom:3mm;">Me responsabilizo de la veracidad de los datos contenidos en este reporte</div>

  <div class="sign-grid">
    <div class="sign-box">
      <div style="min-height:20mm;"></div>
      <div class="sign-label">Nombre y Firma del Funcionario Fiduciario/Verificador que realiza la visita<br><strong>${val(r,'elaboro_nombre')}</strong></div>
    </div>
    <div class="sign-box">
      <div style="min-height:20mm;"></div>
      <div class="sign-label">Nombre y Firma del Funcionario Fiduciario/Verificador Proveedor<br><strong>${val(r,'autorizo_nombre')}</strong></div>
    </div>
  </div>

  <div class="footer-line">
    <span>En la ciudad de ${val(r,'ciudad')} &nbsp; .a ${val(r,'fecha_dia')} de ${val(r,'fecha_mes')} de ${val(r,'fecha_anio','2')}</span>
    <span>Generado por FieldCheck · ${interviewer?.name || ''}</span>
  </div>

</div><!-- /page 2 -->

<!-- ══════════════════════════════════════════════════════
     PÁGINA 3 – FOTOGRAFÍAS
══════════════════════════════════════════════════════ -->
<div class="page">

  <div class="photos-title">Fotografías de Visita Ocular</div>

  <div class="photos-grid">
    ${photoSlotHTML('foto1', 'Fotografía 1: Vialidad principal y propiedad colindantes')}
    ${photoSlotHTML('foto2', 'Fotografía 2: Fotografía del verificador en la fachada tipo selfie')}
    ${photoSlotHTML('foto3', 'Fotografía 3: Fotografía del verificador en el interior de la empresa')}
    ${photoSlotHTML('foto4', 'Fotografía 4: Fotografía del interior del negocio: Inventario, maquinaria, equipo, oficinas, atención a clientes, etc.')}
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;border-top:none;">
    <div class="photo-note">* Fotografías internas NO aplica para Persona Física</div>
    <div class="photo-note">* Fotografías internas NO aplica para Persona Física</div>
  </div>

  <div class="footer-line" style="margin-top:6mm;">
    <span>En la ciudad de ${val(r,'ciudad')} &nbsp; .a ${val(r,'fecha_dia')} de ${val(r,'fecha_mes')} de ${val(r,'fecha_anio','2')}</span>
    <span>2/3</span>
  </div>

</div><!-- /page 3 -->

</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}

// ─── Reporte PYME ─────────────────────────────────────────────────────────────
function generatePymeReport(req, res) {
  const { id } = req.params;
  const { userId, role } = req.user;

  const interview = db.prepare('SELECT * FROM interviews WHERE id=?').get(id);
  if (!interview) return res.status(404).send('Entrevista no encontrada');
  if (role !== 'admin' && interview.scheduled_by !== userId) {
    return res.status(403).send('Acceso denegado');
  }

  const session   = db.prepare('SELECT * FROM interview_sessions WHERE interview_id=? ORDER BY created_at DESC LIMIT 1').get(id);
  const qRow      = db.prepare('SELECT * FROM questionnaire_responses WHERE interview_id=?').get(id);
  const interviewer = db.prepare('SELECT name FROM users WHERE id=?').get(interview.scheduled_by);

  let r = {};
  if (qRow?.responses) {
    try { r = JSON.parse(qRow.responses); } catch { r = {}; }
  }

  const geoCoords = session?.interviewee_location_lat
    ? `${session.interviewee_location_lat.toFixed(6)}, ${session.interviewee_location_lng.toFixed(6)}`
    : '';
  const geoDisplay = val(r, 'url_geolocalizacion', geoCoords || '—');

  const SLOTS = [
    ['foto_vialidad',           'Foto principal – Vialidad'],
    ['foto_fachada',            'Foto del ejecutivo en la fachada'],
    ['foto_interior_ejecutivo', 'Foto del ejecutivo en el interior'],
    ['foto_inventario',         'Inventario'],
    ['foto_maquinaria',         'Maquinaria y Equipo'],
    ['foto_oficinas',           'Oficinas y Atención al Cliente'],
    ['foto_extra_1',            'Foto adicional 1'],
    ['foto_extra_2',            'Foto adicional 2'],
    ['foto_extra_3',            'Foto adicional 3'],
    ['foto_extra_4',            'Foto adicional 4'],
    ['foto_extra_5',            'Foto adicional 5'],
    ['foto_extra_6',            'Foto adicional 6'],
    ['foto_extra_7',            'Foto adicional 7'],
    ['foto_extra_8',            'Foto adicional 8'],
  ];

  const slotImgs = {};
  SLOTS.forEach(([key]) => {
    const filename = val(r, key);
    slotImgs[key] = filename ? photoB64(id, filename) : null;
  });

  const yesno = (key) => {
    const v = val(r, key);
    if (!v) return '—';
    return v === 'si' ? 'SÍ' : 'NO';
  };

  const photoCell = (key, defaultLabel) => {
    const label = val(r, key + '_label', defaultLabel);
    const img = slotImgs[key];
    return `
      <div class="photo-cell">
        <div class="photo-label">${label}</div>
        <div class="photo-box">
          ${img ? `<img src="${img}" alt="${label}" />` : '<div class="photo-empty">Sin fotografía</div>'}
        </div>
      </div>`;
  };

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>Reporte de Visita Ocular – Pyme</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 9.5pt; color: #111; background: #fff; }
  .page { width: 210mm; min-height: 297mm; padding: 12mm 13mm 10mm; margin: 0 auto; }
  @media print {
    .no-print { display: none !important; }
    .page { margin: 0; padding: 10mm 11mm; page-break-after: always; }
    .page:last-child { page-break-after: avoid; }
  }
  .no-print { position: fixed; top: 12px; right: 12px; z-index: 999; display: flex; gap: 8px; }
  .btn-print { background: #1e3a5f; color: #fff; border: none; border-radius: 8px; padding: 10px 20px; font-size: 13px; font-weight: 700; cursor: pointer; }
  .btn-print:hover { background: #2563eb; }

  /* Header */
  .rh { display: flex; justify-content: space-between; align-items: flex-start; border: 1px solid #333; margin-bottom: 2mm; }
  .rh-brand { padding: 3mm 5mm; border-right: 1px solid #333; }
  .rh-brand .brand-sub { font-size: 7.5pt; color: #555; }
  .rh-title { flex: 1; text-align: center; font-size: 11pt; font-weight: 700; padding: 4mm; align-self: center; }
  .rh-meta { border-left: 1px solid #333; font-size: 8pt; min-width: 52mm; }
  .rh-meta-row { display: flex; border-bottom: 1px solid #ddd; }
  .rh-meta-row:last-child { border-bottom: none; }
  .rh-meta-row .mkey { background: #f0f0f0; padding: 1.5mm 2mm; font-weight: 700; white-space: nowrap; border-right: 1px solid #ddd; min-width: 28mm; }
  .rh-meta-row .mval { padding: 1.5mm 2mm; flex: 1; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-bottom: 2mm; }
  th, td { border: 1px solid #999; padding: 1.5mm 2mm; vertical-align: top; }
  th { background: #dce3ed; font-weight: 700; font-size: 8pt; }
  .section-th { background: #1e3a5f; color: #fff; font-size: 8.5pt; text-align: left; padding: 2mm 3mm; }

  .val { min-height: 5mm; }
  .yn { text-align: center; }
  .small { font-size: 7.5pt; color: #555; }

  /* Photos */
  .photos-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; border-top: 1px solid #333; border-left: 1px solid #333; }
  .photos-grid-2 { display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid #333; border-left: 1px solid #333; }
  .photo-cell { border-right: 1px solid #333; border-bottom: 1px solid #333; }
  .photo-label { font-size: 7pt; font-weight: 700; padding: 1.5mm 2mm; border-bottom: 1px solid #ccc; background: #fafafa; }
  .photo-box { width: 100%; height: 72mm; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #f5f5f5; }
  .photo-box img { width: 100%; height: 100%; object-fit: cover; }
  .photo-empty { color: #aaa; font-size: 8pt; }

  .text-box { border: 1px solid #999; min-height: 24mm; padding: 2mm; font-size: 9pt; white-space: pre-wrap; word-break: break-word; }
  .sign-box { border: 1px solid #999; min-height: 25mm; }
  .sign-label { font-size: 7.5pt; color: #555; text-align: center; border-top: 1px solid #999; padding: 1.5mm; }
  .footer-line { display: flex; justify-content: space-between; margin-top: 3mm; font-size: 7.5pt; border-top: 1px solid #ccc; padding-top: 2mm; }

  .recomienda-box { border: 2px solid #333; text-align: center; font-size: 14pt; font-weight: 900; letter-spacing: .1em; padding: 3mm; margin: 2mm 0; }
  .recomienda-val { border: 1px solid #999; min-height: 12mm; padding: 2mm; font-size: 10pt; }
</style>
</head>
<body>
<div class="no-print">
  <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
  <button class="btn-print" style="background:#475569;" onclick="window.close()">Cerrar</button>
</div>

<!-- ══ PÁGINA 1 ══ -->
<div class="page">

  <!-- Header -->
  <div class="rh">
    <div class="rh-brand">
      <div style="font-size:16pt;font-weight:900;color:#1e3a5f;">FieldCheck</div>
      <div class="brand-sub">Informe Confidencial</div>
    </div>
    <div class="rh-title">REPORTE DE VISITA OCULAR</div>
    <div class="rh-meta">
      <div class="rh-meta-row"><div class="mkey">ID del cliente</div><div class="mval">${val(r,'id_cliente')}</div></div>
      <div class="rh-meta-row"><div class="mkey">Monto crédito</div><div class="mval">${val(r,'monto_credito')}</div></div>
      <div class="rh-meta-row"><div class="mkey">Fecha visita</div><div class="mval">${val(r,'fecha_visita')}</div></div>
      <div class="rh-meta-row"><div class="mkey">Destino crédito</div><div class="mval">${val(r,'destino_credito','Capital de Trabajo')}</div></div>
    </div>
  </div>

  <!-- A: Datos del solicitante -->
  <table>
    <tr><th colspan="6" class="section-th">A) DATOS DEL SOLICITANTE DEL CRÉDITO</th></tr>
    <tr><th colspan="6">NOMBRE, RAZÓN SOCIAL O DENOMINACIÓN SOCIAL</th></tr>
    <tr><td colspan="6" class="val">${val(r,'razon_social')}</td></tr>
    <tr>
      <th colspan="2">CALLE Y NÚMERO</th>
      <th colspan="2">COLONIA</th>
      <th colspan="2">MUNICIPIO / ESTADO</th>
    </tr>
    <tr>
      <td colspan="2" class="val">${val(r,'calle_numero')}</td>
      <td colspan="2" class="val">${val(r,'colonia')}</td>
      <td colspan="2" class="val">${val(r,'municipio_estado')}</td>
    </tr>
    <tr>
      <th rowspan="3" style="width:14mm;vertical-align:middle;">GIRO</th>
      <td rowspan="3" class="val">${val(r,'giro')}</td>
      <th>TELÉFONOS</th>
      <td class="val">${val(r,'telefonos')}</td>
      <th>RFC</th>
      <td class="val">${val(r,'rfc')}</td>
    </tr>
    <tr>
      <th>REP. LEGAL</th>
      <td colspan="3" class="val">${val(r,'rep_legal')}</td>
    </tr>
    <tr>
      <th>INMUEBLE</th>
      <td class="val">${val(r,'inmueble')}</td>
      <th>TIPO DE ZONA</th>
      <td class="val">${val(r,'tipo_zona')}</td>
    </tr>
    <tr>
      <th>TIPO DE INMUEBLE</th>
      <td class="val">${val(r,'tipo_inmueble')}</td>
      <th>TIEMPO DE RESIDIR</th>
      <td class="val">${val(r,'tiempo_residir')}</td>
      <th>TIPO DE DOMICILIO</th>
      <td class="val">${val(r,'tipo_domicilio')}</td>
    </tr>
  </table>

  <!-- B: Situación de la empresa -->
  <table>
    <tr><th colspan="8" class="section-th">B) SITUACIÓN DE LA EMPRESA</th></tr>
    <tr>
      <th colspan="2">LOS TRABAJADORES CUENTAN CON</th>
      <th colspan="2">EMPLEADOS</th>
      <th colspan="2">SUCURSALES</th>
      <th colspan="2">ESTADOS/MUNS. CON SUCURSALES</th>
    </tr>
    <tr>
      <td class="small">IMSS</td><td class="yn">${yesno('imss')}</td>
      <td class="small">Cantidad total</td><td class="val">${val(r,'empleados_total')}</td>
      <td class="small">¿Tiene sucursales?</td><td class="yn">${yesno('tiene_sucursales')}</td>
      <td colspan="2" rowspan="3" style="vertical-align:top;" class="val">${val(r,'estados_sucursales')}</td>
    </tr>
    <tr>
      <td class="small">INFONAVIT</td><td class="yn">${yesno('infonavit')}</td>
      <td class="small">Administrativos</td><td class="val">${val(r,'empleados_admin')}</td>
      <td class="small">¿Cuántas?</td><td class="val">${val(r,'num_sucursales')}</td>
    </tr>
    <tr>
      <td class="small">SINDICATO</td><td class="yn">${yesno('sindicato')}</td>
      <td class="small">Operación</td><td class="val">${val(r,'empleados_operacion')}</td>
      <td class="small">¿Cuántas operando?</td><td class="val">${val(r,'sucursales_operando')}</td>
    </tr>
    <tr>
      <th colspan="2">VENTAS Y ANTIGÜEDAD</th>
      <th colspan="2">CLIENTES FRECUENTES</th>
      <th colspan="4">REDES SOCIALES</th>
    </tr>
    <tr>
      <td class="small">Ventas anuales últ. ej. fiscal</td>
      <td class="val">${val(r,'ventas_anuales')}</td>
      <td class="small">¿Cuenta con clientes frecuentes?</td>
      <td class="yn">${yesno('clientes_frecuentes')}</td>
      <td class="small">Instagram</td><td class="val">${val(r,'redes_instagram')}</td>
      <td class="small">Facebook</td><td class="val">${val(r,'redes_facebook')}</td>
    </tr>
    <tr>
      <td class="small">Antigüedad de la empresa</td>
      <td class="val">${val(r,'antiguedad_empresa')}</td>
      <td class="small">% ventas a dichos clientes</td>
      <td class="val">${val(r,'pct_ventas_clientes')}</td>
      <td class="small">LinkedIn</td><td class="val">${val(r,'redes_linkedin')}</td>
      <td class="small">Página web</td><td class="val">${val(r,'redes_web')}</td>
    </tr>
  </table>

  <!-- C: Verificación interpersonal -->
  <table>
    <tr><th colspan="4" class="section-th">C) VERIFICACIÓN INTERPERSONAL</th></tr>
    <tr>
      <th>CÓMO SE PERCIBE AL PERSONAL</th>
      <th>RELACIÓN DIRECTIVOS/EMPLEADOS</th>
      <th>CONDICIONES LABORALES Y DEL INMUEBLE</th>
      <th>¿HA TENIDO HUELGAS O PAROS?</th>
    </tr>
    <tr>
      <td class="val">${val(r,'percepcion_personal')}</td>
      <td class="val">${val(r,'relacion_directivos')}</td>
      <td class="val">${val(r,'condiciones_laborales')}</td>
      <td class="yn">${yesno('huelgas')}</td>
    </tr>
    <tr><th colspan="4" style="font-size:8pt;">SEGURIDAD EN GENERAL CUENTA CON:</th></tr>
    <tr>
      <td class="small">Cámaras de seguridad: <strong>${yesno('camaras_seguridad')}</strong></td>
      <td class="small">Extinguidores: <strong>${yesno('extinguidores')}</strong></td>
      <td class="small">Reglas de seguridad: <strong>${yesno('reglas_seguridad')}</strong></td>
      <td class="small">Seguro local/edificio: <strong>${yesno('seguro_local')}</strong></td>
    </tr>
    <tr>
      <td class="small">Controles de acceso: <strong>${yesno('controles_acceso')}</strong></td>
      <td class="small">Guardias: <strong>${yesno('guardias')}</strong></td>
      <td class="small">Otros: ${val(r,'seguridad_otros','—')}</td>
      <td class="small">Aseguradora: ${val(r,'aseguradora','—')}</td>
    </tr>
  </table>

  <!-- D: Producción y proveedores -->
  <table>
    <tr><th colspan="4" class="section-th">D) PRODUCCIÓN Y PROVEEDORES</th></tr>
    <tr>
      <th>% CAPACIDAD TRABAJANDO</th>
      <th>CUÁNDO OBTIENE LOS INSUMOS</th>
      <th>CONDICIONES DE PAGO</th>
      <th>¿LE HAN NEGADO CRÉDITO?</th>
    </tr>
    <tr>
      <td class="val">${val(r,'capacidad_pct')}</td>
      <td class="val">${val(r,'cuando_insumos')}</td>
      <td class="val">${val(r,'condiciones_pago')}</td>
      <td class="yn">${yesno('negado_credito')}</td>
    </tr>
    <tr>
      <th>CAUSAS O PROBLEMAS</th>
      <th>CÓMO OBTIENE LOS INSUMOS</th>
      <th>RELACIÓN CON CLIENTES</th>
      <th>ESPECIFIQUE</th>
    </tr>
    <tr>
      <td class="val">${val(r,'causas_problemas')}</td>
      <td class="val">${val(r,'como_insumos')}</td>
      <td class="val">${val(r,'relacion_clientes')}</td>
      <td class="val">${val(r,'especifique_clientes')}</td>
    </tr>
  </table>

  <!-- E: Actividad -->
  <table>
    <tr><th colspan="2" class="section-th">E) ACTIVIDAD</th></tr>
    <tr><th>ACTIVIDAD O SERVICIO QUE SE OBSERVA EN LA VISITA</th><th>ACTIVIDAD O SERVICIO REGISTRADA ANTE EL SAT</th></tr>
    <tr>
      <td class="val">${val(r,'actividad_observada')}</td>
      <td class="val">${val(r,'actividad_sat')}</td>
    </tr>
  </table>

  <!-- F: Fotos fachada/vialidad (3 celdas) -->
  <div style="margin-bottom:1.5mm;font-weight:700;font-size:8pt;background:#dce3ed;border:1px solid #999;padding:1.5mm 3mm;">F) FOTOGRAFÍAS ANEXAS Y CROQUIS – Fotografías del negocio y de la ubicación del domicilio</div>
  <div class="photos-grid-3">
    ${photoCell('foto_vialidad',           'Foto principal – Vialidad')}
    ${photoCell('foto_fachada',            'Foto del ejecutivo en la fachada')}
    ${photoCell('foto_interior_ejecutivo', 'Foto del ejecutivo en el interior')}
  </div>

  <div class="footer-line">
    <span>${val(r,'razon_social')} · Pyme</span>
    <span>Generado por FieldCheck · ${interviewer?.name || ''} · 1/4</span>
  </div>
</div><!-- /page 1 -->

<!-- ══ PÁGINA 2 ══ -->
<div class="page">

  <!-- F (cont): Croquis + geo -->
  <div style="margin-bottom:1.5mm;font-weight:700;font-size:8pt;background:#dce3ed;border:1px solid #999;padding:1.5mm 3mm;">F) CROQUIS DE UBICACIÓN Y COORDENADAS</div>
  <div style="border:1px solid #999;min-height:55mm;margin-bottom:2mm;padding:2mm;font-size:8.5pt;color:#555;">
    ${val(r,'croquis_descripcion','(Croquis del inmueble / descripción de ubicación)')}
  </div>
  <div style="border:1px solid #eee;padding:2mm;font-size:8.5pt;margin-bottom:3mm;">
    <strong>URL / Coordenadas:</strong> ${geoDisplay}
  </div>

  <!-- F: Fotos interior (3 celdas) -->
  <div style="margin-bottom:1.5mm;font-weight:700;font-size:8pt;background:#dce3ed;border:1px solid #999;padding:1.5mm 3mm;">FOTOGRAFÍAS INTERIOR DEL NEGOCIO</div>
  <div class="photos-grid-3" style="margin-bottom:3mm;">
    ${photoCell('foto_inventario', 'Inventario')}
    ${photoCell('foto_maquinaria', 'Maquinaria y Equipo')}
    ${photoCell('foto_oficinas',   'Oficinas y Atención al Cliente')}
  </div>

  <div class="footer-line">
    <span>${val(r,'razon_social')} · Pyme</span>
    <span>Generado por FieldCheck · ${interviewer?.name || ''} · 2/4</span>
  </div>
</div><!-- /page 2 -->

<!-- ══ PÁGINA 3 – FOTOGRAFÍAS ADICIONALES ══ -->
<div class="page">

  <div style="margin-bottom:1.5mm;font-weight:700;font-size:8pt;background:#dce3ed;border:1px solid #999;padding:1.5mm 3mm;">F) FOTOGRAFÍAS ADICIONALES</div>
  <div class="photos-grid-3">
    ${photoCell('foto_extra_1', 'Foto adicional 1')}
    ${photoCell('foto_extra_2', 'Foto adicional 2')}
    ${photoCell('foto_extra_3', 'Foto adicional 3')}
    ${photoCell('foto_extra_4', 'Foto adicional 4')}
    ${photoCell('foto_extra_5', 'Foto adicional 5')}
    ${photoCell('foto_extra_6', 'Foto adicional 6')}
    ${photoCell('foto_extra_7', 'Foto adicional 7')}
    ${photoCell('foto_extra_8', 'Foto adicional 8')}
  </div>

  <div class="footer-line" style="margin-top:3mm;">
    <span>${val(r,'razon_social')} · Pyme</span>
    <span>Generado por FieldCheck · ${interviewer?.name || ''} · 3/4</span>
  </div>
</div><!-- /page 3 -->

<!-- ══ PÁGINA 4 ══ -->
<div class="page">

  <!-- G: Comentarios -->
  <div style="margin-bottom:1.5mm;font-weight:700;font-size:8pt;background:#dce3ed;border:1px solid #999;padding:1.5mm 3mm;">G) COMENTARIOS DEL VERIFICADOR</div>
  <div class="text-box" style="min-height:40mm;margin-bottom:3mm;">${val(r,'comentarios_verificador')}</div>

  <!-- H: Diferencias -->
  <table style="margin-bottom:2mm;">
    <tr><th colspan="2" class="section-th">H) DIFERENCIAS ENCONTRADAS</th></tr>
    <tr>
      <td>En la dirección del solicitante o del negocio</td>
      <td class="yn" style="width:14mm;">${yesno('diff_direccion')}</td>
    </tr>
    <tr>
      <td>En la producción</td>
      <td class="yn">${yesno('diff_produccion')}</td>
    </tr>
    <tr>
      <td>Falsedad de información</td>
      <td class="yn">${yesno('diff_falsedad')}</td>
    </tr>
  </table>

  <!-- SE RECOMIENDA -->
  <div class="recomienda-box">SE RECOMIENDA</div>
  <div class="recomienda-val">${val(r,'se_recomienda')}</div>

  <!-- Firma -->
  <div style="display:flex;justify-content:center;margin:6mm 0 3mm;">
    <div style="width:90mm;">
      <div class="sign-box"></div>
      <div class="sign-label">Nombre y Firma de quien realizó la presente investigación<br><strong>${val(r,'investigador_nombre')}</strong></div>
    </div>
  </div>

  <!-- Tabla sucursal -->
  <table style="max-width:110mm;margin:0 auto;">
    <tr><th colspan="4" style="background:#1e3a5f;color:#fff;">NÚMERO Y NOMBRE DE SUCURSAL, TERRITORIO Y REGIÓN</th></tr>
    <tr>
      <th style="width:20mm;">CR</th>
      <th>SUCURSAL</th>
      <th>REGIÓN</th>
      <th>TERRITORIO</th>
    </tr>
    <tr>
      <td class="val" style="min-height:7mm;">${val(r,'sucursal_cr')}</td>
      <td class="val">${val(r,'sucursal_nombre')}</td>
      <td class="val">${val(r,'sucursal_region')}</td>
      <td class="val">${val(r,'sucursal_territorio')}</td>
    </tr>
  </table>

  <div class="footer-line" style="margin-top:6mm;">
    <span>${val(r,'razon_social')} · Pyme</span>
    <span>Generado por FieldCheck · ${interviewer?.name || ''} · 4/4</span>
  </div>
</div><!-- /page 4 -->

</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}

module.exports = { generateFiduciarioReport, generatePymeReport };
