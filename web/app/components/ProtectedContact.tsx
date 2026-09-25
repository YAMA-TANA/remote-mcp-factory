'use client';

import { useState } from 'react';
import { useI18n } from '../i18n';

type Kind = 'email' | 'phone';

const KEY = 73;
const DATA: Record<Kind, number[]> = {
  email: [58, 60, 57, 57, 38, 59, 61, 9, 57, 32, 42, 38, 58, 63, 42, 103, 42, 38, 36],
  phone: [121, 113, 121, 100, 127, 120, 123, 125, 100, 125, 127, 112, 126],
};

function decode(kind: Kind): string {
  return DATA[kind].map((value) => String.fromCharCode(value ^ KEY)).join('');
}

export default function ProtectedContact({ kind }: { kind: Kind }) {
  const { locale, messages } = useI18n();
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(decode(kind));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  const labels = {
    en: { revealEmail: 'Show email address', revealPhone: 'Show phone number', hideEmail: 'Hide email address', hidePhone: 'Hide phone number' },
    ja: { revealEmail: 'メールアドレスを表示', revealPhone: '電話番号を表示', hideEmail: 'メールアドレスを隠す', hidePhone: '電話番号を隠す' },
    'zh-CN': { revealEmail: '显示电子邮件地址', revealPhone: '显示电话号码', hideEmail: '隐藏电子邮件地址', hidePhone: '隐藏电话号码' },
  } as const;
  const revealLabel = kind === 'email' ? labels[locale].revealEmail : labels[locale].revealPhone;
  const hideLabel = kind === 'email' ? labels[locale].hideEmail : labels[locale].hidePhone;
  const contact = decode(kind);
  const href = kind === 'email' ? `mailto:${contact}` : `tel:${contact}`;
  const contactId = `support-contact-${kind}`;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '4px 0 16px' }}>
      <button className="ghost" type="button" aria-expanded={revealed} aria-controls={contactId} onClick={() => setRevealed((value) => !value)}>{revealed ? hideLabel : revealLabel}</button>
      <div id={contactId} style={{ display: revealed ? 'flex' : 'none', alignItems: 'center', gap: 12, flexWrap: 'wrap' }} aria-live="polite">
        <a href={href}>{contact}</a>
        <button className="ghost" type="button" onClick={copy}>{copied ? messages.common.copied : messages.common.copy}</button>
      </div>
    </div>
  );
}
