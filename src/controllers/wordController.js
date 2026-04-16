'use strict';
const fs   = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, HeadingLevel, BorderStyle, ShadingType,
  ImageRun, TableLayoutType,
} = require('docx');

const db     = require('../db/database');
const config = require('../config');

// ─── Helpers ──────────────────────────────────────────────────────────────────
function val(r, key, fallback = '') {
  return (r && r[key]) ? String(r[key]) : fallback;
}

function yesno(r, key) {
  const v = val(r, key);
  if (!v) return '—';
  return v === 'si' ? 'SÍ' : 'NO';
}

function photoBuffer(interviewId, filename) {
  if (!filename) return null;
  const fp = path.join(path.resolve(config.uploadDir), interviewId, filename);
  if (!fs.existsSync(fp)) return null;
  try { return fs.readFileSync(fp); } catch { return null; }
}

// Colores
const BLUE_DARK  = '1E3A5F';
const BLUE_LIGHT = 'DCE3ED';
const WHITE      = 'FFFFFF';

// Bordes estándar de tabla
const BORDER = {
  top:    { style: BorderStyle.SINGLE, size: 4, color: '999999' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
  left:   { style: BorderStyle.SINGLE, size: 4, color: '999999' },
  right:  { style: BorderStyle.SINGLE, size: 4, color: '999999' },
};

function headerCell(text, { colspan = 1, dark = false } = {}) {
  return new TableCell({
    columnSpan: colspan,
    shading: { type: ShadingType.SOLID, color: dark ? BLUE_DARK : BLUE_LIGHT },
    borders: BORDER,
    children: [new Paragraph({
      children: [new TextRun({
        text,
        bold: true,
        size: 18,
        color: dark ? WHITE : '000000',
      })],
      spacing: { before: 40, after: 40 },
    })],
  });
}

function dataCell(text, { colspan = 1, bold = false } = {}) {
  return new TableCell({
    columnSpan: colspan,
    borders: BORDER,
    children: [new Paragraph({
      children: [new TextRun({ text: text || '', bold, size: 18 })],
      spacing: { before: 40, after: 40 },
    })],
  });
}

function sectionRow(text) {
  return new TableRow({ children: [headerCell(text, { colspan: 6, dark: true })] });
}

function h(text) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 22, color: BLUE_DARK })],
    spacing: { before: 200, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: BLUE_DARK } },
  });
}

function photoCell(buf, label) {
  const children = [
    new Paragraph({
      children: [new TextRun({ text: label, bold: true, size: 16 })],
      spacing: { after: 60 },
    }),
  ];
  if (buf) {
    children.push(new Paragraph({
      children: [new ImageRun({ data: buf, transformation: { width: 200, height: 150 }, type: 'jpg' })],
    }));
  } else {
    children.push(new Paragraph({
      children: [new TextRun({ text: '(Sin fotografía)', italics: true, size: 16, color: '999999' })],
    }));
  }
  return new TableCell({ borders: BORDER, children });
}

// ─── WORD FIDUCIARIO ──────────────────────────────────────────────────────────
async function generateFiduciarioWord(req, res) {
  const { id } = req.params;
  const { userId, role } = req.user;

  const interview = db.prepare('SELECT * FROM interviews WHERE id=?').get(id);
  if (!interview) return res.status(404).json({ error: 'Entrevista no encontrada' });
  if (role !== 'admin' && interview.scheduled_by !== userId) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  const session     = db.prepare('SELECT * FROM interview_sessions WHERE interview_id=? ORDER BY created_at DESC LIMIT 1').get(id);
  const qRow        = db.prepare('SELECT * FROM questionnaire_responses WHERE interview_id=?').get(id);
  const interviewer = db.prepare('SELECT name FROM users WHERE id=?').get(interview.scheduled_by);

  let r = {};
  if (qRow?.responses) { try { r = JSON.parse(qRow.responses); } catch { r = {}; } }

  const geoCoords = session?.interviewee_location_lat
    ? `${session.interviewee_location_lat.toFixed(6)}, ${session.interviewee_location_lng.toFixed(6)}`
    : '';
  const geo = val(r, 'url_geolocalizacion', geoCoords || '—');

  const fecha = (() => {
    const d = val(r,'fecha_dia'); const m = val(r,'fecha_mes'); const a = val(r,'fecha_anio');
    return d && m && a ? `${d} / ${m} / ${a}` : new Date(interview.scheduled_at).toLocaleDateString('es-MX');
  })();

  // Fotos
  const slots = ['foto1','foto2','foto3','foto4'];
  const imgs  = {};
  slots.forEach((s) => { const fn = val(r,s); imgs[s] = fn ? photoBuffer(id, fn) : null; });

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Arial', size: 20 } } } },
    sections: [{
      properties: {},
      children: [
        // Título
        new Paragraph({
          children: [new TextRun({ text: 'FieldCheck', bold: true, size: 36, color: BLUE_DARK })],
          alignment: AlignmentType.CENTER,
        }),
        new Paragraph({
          children: [new TextRun({ text: 'Reporte de Visita Ocular – Fiduciario', size: 26 })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        }),

        // ── Encabezado ──
        new Table({
          layout: TableLayoutType.FIXED,
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [
              headerCell('Motivo'), dataCell('FIDUCIARIO'),
              headerCell('Ciudad'), dataCell(val(r,'ciudad')),
              headerCell('Fecha'),  dataCell(fecha),
            ]}),
            new TableRow({ children: [
              headerCell('Fideicomiso', { colspan: 2 }), dataCell(val(r,'numero_fideicomiso'), { colspan: 2 }),
              headerCell('Tipo visita'), dataCell(`Física: ${val(r,'tipo_visita')==='fisica'?'✓':''}  Digital: ${val(r,'tipo_visita')==='digital'?'✓':''}`),
            ]}),
          ],
        }),

        h('Tipo de persona'),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [new TableRow({ children: [
            dataCell(`${val(r,'tipo_persona')==='fisica'?'☑':'☐'} Persona física`),
            dataCell(`${val(r,'tipo_persona')==='fisica_empresarial'?'☑':'☐'} Persona física empresarial`),
            dataCell(`${val(r,'tipo_persona')==='moral'?'☑':'☐'} Persona Moral`),
          ]})],
        }),

        h('Identificación'),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [ headerCell('Apellidos y Nombre(s)', { colspan: 2 }), dataCell(val(r,'apellidos_nombres'), { colspan: 4 }) ]}),
            new TableRow({ children: [ headerCell('Denominación / Razón Social', { colspan: 2 }), dataCell(val(r,'denominacion_razon_social'), { colspan: 4 }) ]}),
            new TableRow({ children: [
              headerCell('Informante'), dataCell(val(r,'informante_nombre'), { colspan: 3 }),
              headerCell('Cargo'), dataCell(val(r,'informante_cargo')),
            ]}),
            new TableRow({ children: [
              headerCell('Tipo ID'), dataCell(val(r,'informante_id_tipo')),
              headerCell('No. ID'),  dataCell(val(r,'informante_id_numero')),
              headerCell('Teléfono'), dataCell(val(r,'telefono')),
              headerCell('Correo'),  dataCell(val(r,'correo')),
            ]}),
          ],
        }),

        h('Domicilio'),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [
              headerCell('Tipo dom.'), dataCell(val(r,'domicilio_tipo')),
              headerCell('Calle y N°', { colspan: 2 }), dataCell(val(r,'domicilio_calle'), { colspan: 3 }),
            ]}),
            new TableRow({ children: [
              headerCell('Colonia', { colspan: 2 }), dataCell(val(r,'domicilio_colonia'), { colspan: 2 }),
              headerCell('Municipio'), dataCell(val(r,'domicilio_municipio')),
            ]}),
            new TableRow({ children: [
              headerCell('Estado', { colspan: 2 }), dataCell(val(r,'domicilio_estado'), { colspan: 2 }),
              headerCell('Entre calles'), dataCell(val(r,'domicilio_entre_calles')),
            ]}),
          ],
        }),

        h('Características del inmueble'),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [
              headerCell('Actividad económica', { colspan: 2 }), dataCell(val(r,'actividad_economica'), { colspan: 2 }),
              headerCell('Tiempo residencia'), dataCell(`${val(r,'tiempo_residencia')} año(s)`),
            ]}),
            new TableRow({ children: [
              headerCell('¿Ingreso al inmueble?'), dataCell(yesno(r,'ingreso_inmueble')),
              headerCell('Causa'), dataCell(val(r,'ingreso_inmueble_causa')),
              headerCell('Tenencia'), dataCell(val(r,'tenencia_inmueble')),
            ]}),
            new TableRow({ children: [
              headerCell('Tipo inmueble', { colspan: 2 }), dataCell(val(r,'tipo_inmueble'), { colspan: 2 }),
              headerCell('Condición'), dataCell(val(r,'condicion_inmueble')),
            ]}),
            new TableRow({ children: [
              headerCell('Zona'), dataCell(val(r,'zona_socioeconomica')),
              headerCell('Logotipo exterior'), dataCell(yesno(r,'logotipo_exterior')),
              headerCell('Autorizó fotos'), dataCell(yesno(r,'autorizo_fotografias')),
            ]}),
          ],
        }),

        h('Observaciones'),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [
              headerCell('¿Se observan empleados?'), dataCell(yesno(r,'empleados')),
              headerCell('Instalaciones acordes?'), dataCell(yesno(r,'instalaciones_acorde')),
              headerCell('¿Por qué?', { colspan: 2 }), dataCell(val(r,'instalaciones_porque'), { colspan: 2 }),
            ]}),
            new TableRow({ children: [ headerCell('Descripción de la operación', { colspan: 6 }) ]}),
            new TableRow({ children: [ dataCell(val(r,'descripcion_operacion'), { colspan: 6 }) ]}),
          ],
        }),

        h('Comentarios del verificador'),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [ new TableRow({ children: [ dataCell(val(r,'comentarios_verificador'), { colspan: 6 }) ] }) ],
        }),

        h('Geolocalización'),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [ new TableRow({ children: [ headerCell('URL / Coordenadas', { colspan: 2 }), dataCell(geo, { colspan: 4 }) ] }) ],
        }),

        h('Firmas'),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [
              headerCell('Elaboró'), dataCell(val(r,'elaboro_nombre'), { colspan: 2 }),
              headerCell('Autorizó'), dataCell(val(r,'autorizo_nombre'), { colspan: 2 }),
            ]}),
          ],
        }),

        // Fotos
        ...(imgs.foto1 || imgs.foto2 || imgs.foto3 || imgs.foto4 ? [
          h('Fotografías'),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({ children: [
                photoCell(imgs.foto1, 'Foto 1 – Vialidad principal'),
                photoCell(imgs.foto2, 'Foto 2 – Ejecutivo en fachada'),
              ]}),
              new TableRow({ children: [
                photoCell(imgs.foto3, 'Foto 3 – Ejecutivo en interior'),
                photoCell(imgs.foto4, 'Foto 4 – Interior del negocio'),
              ]}),
            ],
          }),
        ] : []),

        new Paragraph({
          children: [new TextRun({
            text: `Generado por FieldCheck · ${interviewer?.name || ''} · ${new Date().toLocaleDateString('es-MX')}`,
            size: 16, color: '888888', italics: true,
          })],
          alignment: AlignmentType.RIGHT,
          spacing: { before: 200 },
        }),
      ],
    }],
  });

  const buf = await Packer.toBuffer(doc);
  const filename = `fiduciario-${interview.folio || id}.docx`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.send(buf);
}

// ─── WORD PYME ────────────────────────────────────────────────────────────────
async function generatePymeWord(req, res) {
  const { id } = req.params;
  const { userId, role } = req.user;

  const interview = db.prepare('SELECT * FROM interviews WHERE id=?').get(id);
  if (!interview) return res.status(404).json({ error: 'Entrevista no encontrada' });
  if (role !== 'admin' && interview.scheduled_by !== userId) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  const session     = db.prepare('SELECT * FROM interview_sessions WHERE interview_id=? ORDER BY created_at DESC LIMIT 1').get(id);
  const qRow        = db.prepare('SELECT * FROM questionnaire_responses WHERE interview_id=?').get(id);
  const interviewer = db.prepare('SELECT name FROM users WHERE id=?').get(interview.scheduled_by);

  let r = {};
  if (qRow?.responses) { try { r = JSON.parse(qRow.responses); } catch { r = {}; } }

  const geoCoords = session?.interviewee_location_lat
    ? `${session.interviewee_location_lat.toFixed(6)}, ${session.interviewee_location_lng.toFixed(6)}`
    : '';
  const geo = val(r, 'url_geolocalizacion', geoCoords || '—');

  const PYME_SLOTS = [
    ['foto_vialidad',           'Foto – Vialidad'],
    ['foto_fachada',            'Foto – Fachada'],
    ['foto_interior_ejecutivo', 'Foto – Interior ejecutivo'],
    ['foto_inventario',         'Inventario'],
    ['foto_maquinaria',         'Maquinaria y equipo'],
    ['foto_oficinas',           'Oficinas y atención'],
  ];
  const imgs = {};
  PYME_SLOTS.forEach(([k]) => { const fn = val(r,k); imgs[k] = fn ? photoBuffer(id, fn) : null; });

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Arial', size: 20 } } } },
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          children: [new TextRun({ text: 'FieldCheck', bold: true, size: 36, color: BLUE_DARK })],
          alignment: AlignmentType.CENTER,
        }),
        new Paragraph({
          children: [new TextRun({ text: 'Reporte de Visita Ocular – Crédito Pyme', size: 26 })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        }),

        // Encabezado
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [
              headerCell('ID cliente'),  dataCell(val(r,'id_cliente')),
              headerCell('Monto'),       dataCell(val(r,'monto_credito')),
              headerCell('Fecha visita'), dataCell(val(r,'fecha_visita')),
              headerCell('Destino'),     dataCell(val(r,'destino_credito','Capital de Trabajo')),
            ]}),
          ],
        }),

        h('A) Datos del solicitante'),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [ headerCell('Razón Social / Nombre', { colspan: 2 }), dataCell(val(r,'razon_social'), { colspan: 4 }) ]}),
            new TableRow({ children: [
              headerCell('Calle y N°', { colspan: 2 }), dataCell(val(r,'calle_numero'), { colspan: 2 }),
              headerCell('Colonia'), dataCell(val(r,'colonia')),
            ]}),
            new TableRow({ children: [
              headerCell('Municipio / Estado', { colspan: 2 }), dataCell(val(r,'municipio_estado'), { colspan: 2 }),
              headerCell('Tipo domicilio'), dataCell(val(r,'tipo_domicilio')),
            ]}),
            new TableRow({ children: [
              headerCell('Giro'), dataCell(val(r,'giro')),
              headerCell('RFC'),  dataCell(val(r,'rfc')),
              headerCell('Teléfono'), dataCell(val(r,'telefonos')),
              headerCell('Rep. Legal'), dataCell(val(r,'rep_legal')),
            ]}),
            new TableRow({ children: [
              headerCell('Inmueble'), dataCell(val(r,'inmueble')),
              headerCell('Tipo zona'), dataCell(val(r,'tipo_zona')),
              headerCell('Tipo inmueble'), dataCell(val(r,'tipo_inmueble')),
              headerCell('Tiempo residir'), dataCell(val(r,'tiempo_residir')),
            ]}),
          ],
        }),

        h('B) Situación de la empresa'),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [
              headerCell('IMSS'), dataCell(yesno(r,'imss')),
              headerCell('INFONAVIT'), dataCell(yesno(r,'infonavit')),
              headerCell('Sindicato'), dataCell(yesno(r,'sindicato')),
              headerCell('Total empleados'), dataCell(val(r,'empleados_total')),
            ]}),
            new TableRow({ children: [
              headerCell('Administrativos'), dataCell(val(r,'empleados_admin')),
              headerCell('Operación'), dataCell(val(r,'empleados_operacion')),
              headerCell('Sucursales'), dataCell(yesno(r,'tiene_sucursales')),
              headerCell('Cuántas'), dataCell(val(r,'num_sucursales')),
            ]}),
            new TableRow({ children: [
              headerCell('Ventas anuales últ. ej.'), dataCell(val(r,'ventas_anuales'), { colspan: 2 }),
              headerCell('Antigüedad'), dataCell(val(r,'antiguedad_empresa')),
            ]}),
            new TableRow({ children: [
              headerCell('Instagram'), dataCell(val(r,'redes_instagram')),
              headerCell('Facebook'), dataCell(val(r,'redes_facebook')),
              headerCell('LinkedIn'), dataCell(val(r,'redes_linkedin')),
              headerCell('Web'), dataCell(val(r,'redes_web')),
            ]}),
          ],
        }),

        h('C) Verificación interpersonal'),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [
              headerCell('Percepción personal'), dataCell(val(r,'percepcion_personal')),
              headerCell('Relación directivos/empleados'), dataCell(val(r,'relacion_directivos')),
              headerCell('Condiciones laborales'), dataCell(val(r,'condiciones_laborales')),
            ]}),
            new TableRow({ children: [
              headerCell('¿Huelgas/paros?'), dataCell(yesno(r,'huelgas')),
              headerCell('Cámaras'), dataCell(yesno(r,'camaras_seguridad')),
              headerCell('Extinguidores'), dataCell(yesno(r,'extinguidores')),
            ]}),
            new TableRow({ children: [
              headerCell('Reglas seguridad'), dataCell(yesno(r,'reglas_seguridad')),
              headerCell('Seguro local'), dataCell(yesno(r,'seguro_local')),
              headerCell('Controles acceso'), dataCell(yesno(r,'controles_acceso')),
            ]}),
            new TableRow({ children: [
              headerCell('Guardias'), dataCell(yesno(r,'guardias')),
              headerCell('Otros'), dataCell(val(r,'seguridad_otros')),
              headerCell('Aseguradora'), dataCell(val(r,'aseguradora')),
            ]}),
          ],
        }),

        h('D) Producción y proveedores'),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [
              headerCell('% Capacidad'), dataCell(val(r,'capacidad_pct')),
              headerCell('Cuándo insumos'), dataCell(val(r,'cuando_insumos')),
              headerCell('Condiciones pago'), dataCell(val(r,'condiciones_pago')),
              headerCell('¿Negado crédito?'), dataCell(yesno(r,'negado_credito')),
            ]}),
            new TableRow({ children: [
              headerCell('Cómo insumos'), dataCell(val(r,'como_insumos')),
              headerCell('Relación clientes'), dataCell(val(r,'relacion_clientes')),
              headerCell('Causas / Problemas', { colspan: 2 }), dataCell(val(r,'causas_problemas'), { colspan: 2 }),
            ]}),
          ],
        }),

        h('E) Actividad'),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [ headerCell('Actividad observada', { colspan: 2 }), dataCell(val(r,'actividad_observada'), { colspan: 4 }) ]}),
            new TableRow({ children: [ headerCell('Actividad ante el SAT', { colspan: 2 }), dataCell(val(r,'actividad_sat'), { colspan: 4 }) ]}),
          ],
        }),

        h('F) Geolocalización'),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [ headerCell('URL / Coordenadas'), dataCell(geo, { colspan: 2 }) ]}),
            new TableRow({ children: [ headerCell('Croquis / descripción'), dataCell(val(r,'croquis_descripcion'), { colspan: 2 }) ]}),
          ],
        }),

        h('G) Comentarios del verificador'),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [ new TableRow({ children: [ dataCell(val(r,'comentarios_verificador'), { colspan: 4 }) ] }) ],
        }),

        h('H) Diferencias encontradas'),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [
              headerCell('En la dirección'), dataCell(yesno(r,'diff_direccion')),
              headerCell('En la producción'), dataCell(yesno(r,'diff_produccion')),
              headerCell('Falsedad de información'), dataCell(yesno(r,'diff_falsedad')),
            ]}),
          ],
        }),

        h('SE RECOMIENDA'),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [ new TableRow({ children: [ dataCell(val(r,'se_recomienda'), { colspan: 4 }) ] }) ],
        }),

        h('Firma y datos del verificador'),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [
              headerCell('Investigador'), dataCell(val(r,'investigador_nombre'), { colspan: 3 }),
            ]}),
            new TableRow({ children: [
              headerCell('CR'), dataCell(val(r,'sucursal_cr')),
              headerCell('Sucursal'), dataCell(val(r,'sucursal_nombre')),
              headerCell('Región'), dataCell(val(r,'sucursal_region')),
              headerCell('Territorio'), dataCell(val(r,'sucursal_territorio')),
            ]}),
          ],
        }),

        // Fotos
        ...(PYME_SLOTS.some(([k]) => imgs[k]) ? [
          h('Fotografías'),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({ children: [
                photoCell(imgs['foto_vialidad'],   'Vialidad'),
                photoCell(imgs['foto_fachada'],    'Ejecutivo en fachada'),
                photoCell(imgs['foto_interior_ejecutivo'], 'Ejecutivo en interior'),
              ]}),
              new TableRow({ children: [
                photoCell(imgs['foto_inventario'], 'Inventario'),
                photoCell(imgs['foto_maquinaria'], 'Maquinaria y equipo'),
                photoCell(imgs['foto_oficinas'],   'Oficinas y atención'),
              ]}),
            ],
          }),
        ] : []),

        new Paragraph({
          children: [new TextRun({
            text: `Generado por FieldCheck · ${interviewer?.name || ''} · ${new Date().toLocaleDateString('es-MX')}`,
            size: 16, color: '888888', italics: true,
          })],
          alignment: AlignmentType.RIGHT,
          spacing: { before: 200 },
        }),
      ],
    }],
  });

  const buf = await Packer.toBuffer(doc);
  const filename = `pyme-${interview.folio || id}.docx`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.send(buf);
}

module.exports = { generateFiduciarioWord, generatePymeWord };
