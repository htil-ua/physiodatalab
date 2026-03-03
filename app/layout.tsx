import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Muse Streamer',
  description: 'Stream Muse data in real time using BCIDevice.'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
