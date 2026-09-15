import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Remote MCP Factory',
  description: 'Paste a GitHub MCP repository and get a Remote MCP endpoint.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
