import type { Metadata } from 'next';
import TokushohoClient from './TokushohoClient';

export const metadata: Metadata = {
  title: '特定商取引法に基づく表記 — PicoSvc',
  description: 'PicoSvcの特定商取引法に基づく表示。英語・日本語・簡体字中国語に対応しています。',
};

export default function TokushohoPage() {
  return <TokushohoClient />;
}
