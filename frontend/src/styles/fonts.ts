import localFont from 'next/font/local';

/*
 * Self-hosted Geist fonts, served from the `geist` package (no external CDN).
 * They only expose the --font-geist-sans / --font-geist-mono variables consumed by
 * src/styles/tokens.css. Every screen renders with them, so both are preloaded.
 */
export const fontSans = localFont({
  src: '../../node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2',
  variable: '--font-geist-sans',
  weight: '100 900',
  display: 'swap',
  preload: true,
});

export const fontMono = localFont({
  src: '../../node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2',
  variable: '--font-geist-mono',
  weight: '100 900',
  display: 'swap',
  preload: true,
});
