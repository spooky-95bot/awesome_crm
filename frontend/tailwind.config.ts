// frontend/tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fdf8f0',
          100: '#f5e6d3',
          200: '#e8d0b0',
          300: '#d4b48a',
          400: '#c49a6c',
          500: '#b18a4c',
          600: '#80602d',
          700: '#6b4f24',
          800: '#5a4220',
          900: '#4a371c',
        },
        elysence: {
          gold: '#80602d',
          goldLight: '#b18a4c',
          cream: '#f6efe3',
          paper: '#fbf8f2',
          ink: '#17120d',
          espresso: '#241b13',
        },
      },
    },
  },
  plugins: [],
};

export default config;
