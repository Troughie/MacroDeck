/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0f0f0f',
          secondary: '#1a1a2e',
          tertiary: '#16213e',
          card: '#1e1e3a',
          hover: '#252545',
        },
        accent: {
          blue: '#3b82f6',
          'blue-dark': '#1d4ed8',
          'blue-glow': '#60a5fa',
          green: '#22c55e',
          red: '#ef4444',
          yellow: '#f59e0b',
          purple: '#8b5cf6',
        },
        border: {
          DEFAULT: '#2a2a4a',
          active: '#3b82f6',
          hover: '#3a3a5a',
        },
        text: {
          primary: '#f1f5f9',
          secondary: '#94a3b8',
          muted: '#64748b',
          accent: '#3b82f6',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        'glow-blue': '0 0 16px rgba(59, 130, 246, 0.6)',
        'glow-blue-sm': '0 0 8px rgba(59, 130, 246, 0.4)',
        'glow-green': '0 0 12px rgba(34, 197, 94, 0.5)',
        'card': '0 4px 24px rgba(0, 0, 0, 0.4)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-up': 'slideUp 0.2s ease-out',
        'fade-in': 'fadeIn 0.15s ease-out',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
