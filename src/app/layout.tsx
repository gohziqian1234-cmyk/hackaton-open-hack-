import type { Metadata } from 'next';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import './globals.css';
import { Shell } from '../components/shell';
export const metadata: Metadata = {
  title: 'LoopBox — A little mystery. A better way to collect.',
  description:
    'Play the drop. Reveal your Astral Kin. Trade before we make. Limited collectibles, made to confirmed demand.',
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
