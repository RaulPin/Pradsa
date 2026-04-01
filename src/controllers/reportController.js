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
    <div class="report-brand">EntrevistasPradsa</div>
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
    <span>Generado por EntrevistasPradsa · ${interviewer?.name || ''}</span>
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

module.exports = { generateFiduciarioReport };
