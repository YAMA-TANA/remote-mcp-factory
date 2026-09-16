'use client';

import { useI18n } from '../i18n';

export default function SiteFooter() {
  const { messages, localizedHref } = useI18n();
  const c = messages.common;
  return (
    <div className="globalLegalFooter shell">
      <a href={localizedHref('/contact')}>{c.contact} / {c.support}</a>
      <span> · </span>
      <a href={localizedHref('/terms')}>{c.terms}</a>
      <span> · </span>
      <a href={localizedHref('/privacy')}>{c.privacy}</a>
      <span> · </span>
      <a href={localizedHref('/tokushoho')}>{c.commercial}</a>
    </div>
  );
}
