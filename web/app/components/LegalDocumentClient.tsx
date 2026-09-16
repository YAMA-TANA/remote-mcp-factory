'use client';

import { LanguageSwitcher, useI18n } from '../i18n';
import type { LegalDocument, LegalLocale } from '../legal-copy';

export default function LegalDocumentClient({ documents }: { documents: Record<LegalLocale, LegalDocument> }) {
  const { locale, messages } = useI18n();
  const c = messages.common;
  const doc = documents[locale];
  return (
    <main>
      <nav className="nav shell">
        <a className="brand" href="/"><span className="brandMark">P</span><span>PicoSvc</span></a>
        <div className="navRight"><a href="/">{c.products}</a><a href="/contact">{c.contact}</a><a href="/terms">{c.terms}</a><a href="/privacy">{c.privacy}</a><LanguageSwitcher /></div>
      </nav>
      <article className="legal shell">
        <div className="eyebrow"><span className="dot" /> {doc.badge}</div>
        <h1>{doc.title}</h1>
        {doc.effective && <p className="legalMeta">{doc.effective}</p>}
        {doc.note && <div className="notice">{doc.note}</div>}
        {doc.intro && <p>{doc.intro}</p>}
        {doc.sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            {section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            {section.subheadings?.map((sub) => (
              <div key={sub.title}><h3>{sub.title}</h3>{sub.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
            ))}
          </section>
        ))}
      </article>
    </main>
  );
}
