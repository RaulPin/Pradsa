// Colores de marca por banca. Coinciden con el esquema del cliente:
// Banca PyMe = rojo, Sucursales = azul marino. Las futuras bancas
// reciben un color de la paleta de respaldo según su orden.

const BY_CODE: Record<string, string> = {
  PYME: '#e11d48',       // rojo (rose-600)
  SUCURSALES: '#1e40af', // azul marino (blue-800)
};

const FALLBACK = ['#0891b2', '#7c3aed', '#ea580c', '#16a34a', '#db2777', '#0d9488'];

export function bancaColor(code: string | null | undefined, index = 0): string {
  if (code && BY_CODE[code.toUpperCase()]) return BY_CODE[code.toUpperCase()];
  return FALLBACK[index % FALLBACK.length];
}

// Color para carpetas sin banca asignada.
export const NO_BANCA_COLOR = '#94a3b8'; // slate-400
