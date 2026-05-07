import type { Config } from 'tailwindcss'

export default {
  content: [
    './config/**/*.ts',
  ],
  safelist: [
    'bg-blue-100', 'text-blue-700',
    'bg-emerald-100', 'text-emerald-700',
    'bg-red-100', 'text-red-700',
    'bg-violet-100', 'text-violet-700',
  ],
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
