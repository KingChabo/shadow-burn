/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Hell/Dunkel: Grundfarben kommen aus CSS-Variablen (index.css, Klasse .light auf <html>)
        bg: 'rgb(var(--bg) / <alpha-value>)',
        panel: 'rgb(var(--panel) / <alpha-value>)',
        raised: 'rgb(var(--raised) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        mute: 'rgb(var(--mute) / <alpha-value>)',
        // "neon" bleibt als Name für die Akzentfarbe, damit alle Screens mitziehen.
        // Kommt aus einer CSS-Variable, damit das Level-Theme die ganze App umfärbt.
        neon: 'rgb(var(--accent, 255 107 53) / <alpha-value>)',
        // Schrift auf Akzentflächen, wechselt mit dem Level-Theme
        onaccent: 'rgb(var(--on-accent, 26 13 6) / <alpha-value>)',
        volt: '#8FA3B8',
        gem: '#9C86F0',
        fire: '#F5A524',
        bad: '#E5484D',
        good: '#4CB782',
      },
      fontFamily: {
        display: ['"Inter Variable"', 'system-ui', 'sans-serif'],
        // Arena-Schrift: schmale Großbuchstaben für Überschriften und große Zahlen
        sport: ['Oswald', '"Inter Variable"', 'sans-serif'],
        body: ['"Inter Variable"', 'system-ui', 'sans-serif'],
      },
      borderRadius: { '2xl': '18px', '3xl': '24px' },
      boxShadow: { card: 'var(--card-shadow)', float: 'var(--float-shadow)' },
    },
  },
  plugins: [],
};
