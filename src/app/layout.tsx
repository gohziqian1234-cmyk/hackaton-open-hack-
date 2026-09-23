import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/unbounded';
import '@fontsource-variable/figtree';
import './globals.css';
import { Shell } from '../components/shell';
export const metadata: Metadata = {
  title: 'LoopBox — A little mystery, made to order.',
  description:
    'Play the drop. Reveal your Astral Kin. Trade before we make. Limited collectibles, made to confirmed demand.',
};
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#17123A',
  colorScheme: 'dark',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
