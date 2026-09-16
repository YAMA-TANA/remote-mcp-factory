import type { Metadata } from 'next';
import './globals.css';
import { LocaleProvider } from './i18n';
import SiteFooter from './components/SiteFooter';

export const metadata: Metadata = {
  metadataBase: new URL('https://picosvc.com'),
  title: 'PicoSvc — Tiny developer services, one account',
  description: 'Small developer infrastructure with separate product plans and optional bundles: MCP hosting, mock APIs, webhooks, RSS, screenshots, QR, cron, files, forms, and more.',
  robots: { index: false, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <LocaleProvider>
          {children}
          <SiteFooter />
        </LocaleProvider>
      </body>
    </html>
  );
}
