import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        teal: {
          DEFAULT: '#0c9f92',
          dark: '#08776f',
        },
        navy: '#17374b',
        mint: '#e9f8f5',
        'pro-ink': '#152236',
        'pro-muted': '#66748a',
        'pro-line': '#dce6ea',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        heading: ['Manrope', 'Inter', 'sans-serif'],
      },
      borderRadius: {
        card: '20px',
        pill: '999px',
      },
    },
  },
  plugins: [],
}

export default config
