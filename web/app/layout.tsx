import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PicoSvc — Tiny developer services, one account',
  description: 'Small developer infrastructure with separate product plans and optional bundles: MCP hosting, mock APIs, webhooks, RSS, screenshots, QR, cron, files, forms, and more.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <div style={{ width: 'min(1120px, calc(100% - 40px))', margin: '0 auto', padding: '0 0 30px', textAlign: 'right', fontSize: 12, color: '#606977' }}>
          <a href="/contact" style={{ color: '#7e8793', textDecoration: 'none' }}>Contact / Support</a>
          <span> · </span>
          <a href="/terms" style={{ color: '#7e8793', textDecoration: 'none' }}>Terms</a>
          <span> · </span>
          <a href="/privacy" style={{ color: '#7e8793', textDecoration: 'none' }}>Privacy</a>
          <span> · </span>
          <a href="/tokushoho" style={{ color: '#7e8793', textDecoration: 'none' }}>特定商取引法</a>
        </div>
      </body>
    </html>
  );
}
