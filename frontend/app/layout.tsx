import type { Metadata } from 'next';
import './globals.css';
import { fontMono, fontSans } from '@/src/styles/fonts';
import { Providers } from '@/src/queries/Providers';
import { themeInitScript } from '@/src/styles/theme';

export const metadata: Metadata = {
  title: 'MarkSync',
  description: 'Collaborative Markdown document workspace',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${fontSans.variable} ${fontMono.variable} h-full antialiased`}
      // The theme script below adds the `dark` class before React hydrates.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
