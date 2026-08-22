import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Bastión — "sello / bóveda": marino profundo + latón.
        ink: {
          DEFAULT: '#0e1626',   // marino tinta (fondo del panel de control)
          soft: '#16223a',
          line: '#27374f',
          muted: '#8fa1b9',
        },
        brass: {
          DEFAULT: '#b0851f',   // latón (acento sobre fondo claro)
          light: '#d6a63c',     // latón sobre fondo oscuro
          dark: '#8a681a',
        },
        // Semánticos de riesgo (separados del acento de marca)
        risk: {
          low: '#2f9e5b',
          med: '#e0a82e',
          high: '#e4702a',
          crit: '#d2453d',
        },
      },
      fontFamily: {
        display: ['"Iowan Old Style"', '"Palatino Linotype"', 'Palatino', 'Georgia', 'serif'],
        mono: ['ui-monospace', '"SF Mono"', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
