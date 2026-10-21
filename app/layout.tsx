import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Block Builder — Daily Competitive Falling Blocks',
  description:
    'Play the exact same 100 blocks each day. Fair, seeded, gasless competitive chain puzzle on Avalanche.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
        {/* Preload primary start gate theme so audio is buffered immediately on page load */}
        <link rel="preload" href="/audio/music/menu/vaporware.mp3" as="fetch" crossOrigin="anonymous" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var params = new URLSearchParams(window.location.search);
                var force = params.get('intro') === '1' || params.get('intro') === 'true';
                var shown = sessionStorage.getItem('bb-intro-shown');
                if (force || !shown) {
                  document.documentElement.classList.add('bb-intro-pending');
                } else {
                  document.documentElement.classList.add('bb-intro-done');
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
