/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx,html}',
    './public/approved-dashboard-runtime.js',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Manrope', 'sans-serif'],
        display: ['Space Grotesk', 'sans-serif'],
      },
      colors: {
        pine: '#21473B',
        moss: '#2F6A4F',
        amber: '#D08A2D',
        ember: '#AF4D38',
        ink: '#14201B',
        mist: '#EEF2EC',
        sand: '#F4EFE5',
      },
    },
  },
}
