import type { Metadata } from 'next';
import './globals.css';
import './atlas.css';
export const metadata: Metadata = {
  title: 'Hisaab — Follow the money',
  description: 'Public works. Original records. Clear questions.',
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
