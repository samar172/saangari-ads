/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#FDF3F2',
          100: '#FBE3E0',
          200: '#F5C2BC',
          300: '#E9968C',
          400: '#D6685C',
          500: '#BE4136',
          600: '#9C2A20',
          700: '#8E1D14', // primary — sampled from the logo
          800: '#6E1610',
          900: '#4A0F0B',
          950: '#2B0806',
        },
        gold: {
          300: '#E8CE8A',
          400: '#D9B65C',
          500: '#C9A227',
          600: '#A5831C',
        },
        cream: {
          50: '#FDFBF8',
          100: '#FBF7F2',
          200: '#F4EDE4',
          300: '#E8DCCC',
        },
        ink: '#1A1210',
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      transitionDuration: {
        400: '400ms',
        600: '600ms',
      },
      boxShadow: {
        soft: '0 2px 8px -2px rgba(26,18,16,0.06), 0 12px 32px -12px rgba(26,18,16,0.12)',
        lift: '0 8px 20px -6px rgba(142,29,20,0.18), 0 24px 56px -20px rgba(142,29,20,0.28)',
        glow: '0 0 0 1px rgba(201,162,39,0.35), 0 18px 50px -18px rgba(201,162,39,0.45)',
      },
      backgroundImage: {
        'grain':
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E\")",
      },
      keyframes: {
        float: {
          '0%,100%': { transform: 'translate3d(0,0,0) scale(1)' },
          '50%': { transform: 'translate3d(0,-22px,0) scale(1.04)' },
        },
        drift: {
          '0%,100%': { transform: 'translate3d(0,0,0)' },
          '33%': { transform: 'translate3d(30px,-20px,0)' },
          '66%': { transform: 'translate3d(-24px,16px,0)' },
        },
        marquee: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(18px)' },
          to: { opacity: '1', transform: 'none' },
        },
        grow: { from: { transform: 'scaleX(0)' }, to: { transform: 'scaleX(1)' } },
        scrollcue: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(300%)' },
        },
      },
      animation: {
        float: 'float 9s ease-in-out infinite',
        drift: 'drift 18s ease-in-out infinite',
        marquee: 'marquee 32s linear infinite',
        shimmer: 'shimmer 2.4s infinite',
        'fade-up': 'fade-up .7s cubic-bezier(.2,.7,.2,1) both',
        grow: 'grow .9s cubic-bezier(.2,.7,.2,1) both',
        scrollcue: 'scrollcue 2.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
