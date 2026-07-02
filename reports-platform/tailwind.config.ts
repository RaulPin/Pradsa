import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Sistema visual "corporativo bancario"
        sidebar: '#0e1f3a',       // azul marino profundo
        sidebarHover: '#16294a',
        navy: {
          DEFAULT: '#0e1f3a',
          soft: '#1d335a',
        },
        primary: {
          DEFAULT: '#9b1c31',     // vino / carmesí (acento de marca)
          dark: '#7e1728',
          light: '#b23a4e',
        },
        gold: {
          DEFAULT: '#b0873c',     // dorado metálico (uso moderado)
          soft: '#c9a35f',
        },
      },
      fontFamily: {
        display: ['Georgia', '"Times New Roman"', 'serif'],
      },
    },
  },
  plugins: [],
};

export default config;
