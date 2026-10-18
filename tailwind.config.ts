import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#14213d',
          soft: '#3d4a63',
          muted: '#6b768c',
        },
        canvas: '#f4f6f9',
        line: '#e2e6ee',
        brand: {
          DEFAULT: '#1f4fd1',
          soft: '#e8eefc',
          dark: '#173c9e',
        },
        good: { DEFAULT: '#0f7a55', soft: '#e3f4ec' },
        warn: { DEFAULT: '#a15c00', soft: '#fdf1dc' },
        bad: { DEFAULT: '#c0262d', soft: '#fdeaea' },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(20, 33, 61, 0.06)',
      },
    },
  },
  plugins: [],
};

export default config;
