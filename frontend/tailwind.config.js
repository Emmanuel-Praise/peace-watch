/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fbf7f2',
          100: '#f3ebe0',
          200: '#e4d3bf',
          300: '#d0b294',
          400: '#b98d63',
          500: '#a57145',
          600: '#8a5736',
          700: '#6f442c',
          800: '#553423',
          900: '#3d2518',
        },
      },
      boxShadow: {
        glow: '0 1px 4px rgba(106, 72, 44, 0.20)',
      },
    },
  },
  plugins: [],
}
