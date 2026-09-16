'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';

export default function SiteFooter({ legacyOnly = false }: { legacyOnly?: boolean }) {
  const { messages, localizedHref } = useI18n();
  const [showLegacy, setShowLegacy] = useState(false);
  const c = messages.common;

  useEffect(() => {
    if (!legacyOnly) return;
    setShowLegacy(!/^\/(en|ja|zh-cn)(\/|$)/.test(window.location.pathname));
  }, [legacyOnly]);

  if (legacyOnly && !showLegacy) return null;

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
