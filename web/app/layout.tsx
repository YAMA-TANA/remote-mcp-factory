import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PicoSvc — Tiny developer services, one account',
  description: 'Small developer infrastructure with separate product plans and optional bundles: MCP hosting, mock APIs, webhooks, RSS, screenshots, QR, cron, files, forms, and more.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
