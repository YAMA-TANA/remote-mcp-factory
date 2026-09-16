'use client';

import { useI18n } from '../i18n';

export default function SiteFooter() {
  const { messages } = useI18n();
  const c = messages.common;
  return (
    <div className="globalLegalFooter shell">
      <a href="/contact">{c.contact} / {c.support}</a>
      <span> · </span>
      <a href="/terms">{c.terms}</a>
      <span> · </span>
      <a href="/privacy">{c.privacy}</a>
      <span> · </span>
      <a href="/tokushoho">{c.commercial}</a>
    </div>
  );
}
