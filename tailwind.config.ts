import type { Config } from 'tailwindcss'

export default {
  content: [],
  theme: {
    extend: {
      colors: {
        primary: '#6598d0',
        success: '#69c3a0',
        danger: '#f27d80',
      },
      fontFamily: {
        sans: ['Parkinsans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
} satisfies Config
