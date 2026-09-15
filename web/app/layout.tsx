import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PicoSvc — Tiny developer services from $1/month',
  description: 'Small developer infrastructure in one account: MCP hosting, mock APIs, webhooks, RSS, screenshots, QR, cron, files, forms, and more.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
