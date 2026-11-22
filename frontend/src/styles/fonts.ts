import localFont from 'next/font/local';

/*
 * Self-hosted Geist fonts, served from the `geist` package (no external CDN).
 * They only expose the --font-geist-sans / --font-geist-mono variables consumed by
 * src/styles/tokens.css. Preloading is off until screens actually render with them,
 * so pages that still use the legacy fonts do not download unused files.
 */
export const fontSans = localFont({
  src: '../../node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2',
  variable: '--font-geist-sans',
  weight: '100 900',
  display: 'swap',
  preload: false,
});

export const fontMono = localFont({
  src: '../../node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2',
  variable: '--font-geist-mono',
  weight: '100 900',
  display: 'swap',
  preload: false,
});
