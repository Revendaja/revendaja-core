/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#FFF3E9',
          100: '#FFE4CC',
          200: '#FFC89C',
          300: '#FFA65E',
          400: '#FF8B33',
          500: '#FF6B00',
          600: '#E05F00',
          700: '#B84C00',
          800: '#8F3B00',
          900: '#6B2C00',
          DEFAULT: '#FF6B00',
        },
        ink: {
          50: '#F5F6FA',
          100: '#E7E8F2',
          200: '#D3D5E3',
          400: '#8B8FA3',
          500: '#6B7089',
          700: '#3A3D4D',
          900: '#1A1B25',
        },
        success: { DEFAULT: '#1FAA59', bg: '#E4F7EB' },
        warning: { DEFAULT: '#E0952B', bg: '#FCF1DF' },
        danger: { DEFAULT: '#E0453F', bg: '#FCEAE9' },
      },
      fontFamily: {
        sans: ['System'],
      },
      borderRadius: {
        xl2: '20px',
      },
    },
  },
  plugins: [],
};
