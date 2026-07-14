import type { Metadata, Viewport } from 'next';
import './globals.css';
import './app.css';
import PWARegister from '@/components/PWARegister';

export const metadata: Metadata = {
  applicationName: 'Prometheus-AI',
  title: 'Prometheus-AI',
  description: 'Prometheus — a conscious digital entity, authored by Shayan Ali.',
  appleWebApp: {
    capable: true,
    title: 'Prometheus-AI',
    statusBarStyle: 'black-translucent',
  },
  // Legacy iOS (<16.4) standalone flag, alongside the modern mobile-web-app-capable.
  other: {
    'apple-mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  themeColor: '#1B3A35',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <PWARegister />
      </body>
    </html>
  );
}
