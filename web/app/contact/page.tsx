import type { Metadata } from 'next';
import ProtectedContact from '../components/ProtectedContact';

export const metadata: Metadata = {
  title: 'Contact & Support — PicoSvc',
  description: 'Contact PicoSvc support and request legally required business information.',
};

export default function ContactPage() {
  return (
    <main>
      <nav className="nav shell">
        <a className="brand" href="/"><span className="brandMark">P</span><span>PicoSvc</span></a>
        <div className="navRight"><a href="/">Products</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a></div>
      </nav>

      <article className="legal shell">
        <div className="eyebrow"><span className="dot" /> Support</div>
        <h1>Contact & Support</h1>
        <p>PicoSvc is operated by the sole proprietorship <strong>Y&amp;T</strong>. For product support, billing questions, privacy requests, security-related questions, or requests for statutory business information, use the channels below.</p>

        <h2>Email</h2>
        <ProtectedContact kind="email" />
        <p className="legalMeta">Email is the preferred channel for support and disclosure requests. Do not send passwords, private keys, API secrets, or other credentials.</p>

        <h2>Telephone</h2>
        <ProtectedContact kind="phone" />
        <p className="legalMeta">Telephone availability may vary. For requests that require a written response or disclosure of statutory information, please use email.</p>

        <h2>Specified Commercial Transactions Act disclosure requests</h2>
        <p>Where information is lawfully omitted from the public statutory disclosure page, including the proprietor&apos;s legal name or business address, it will be provided without undue delay by email or another appropriate written method upon request, with enough time for you to review it before deciding whether to purchase.</p>
        <p>For such a request, contact support and state that you are requesting disclosure of information under Japan&apos;s Specified Commercial Transactions Act.</p>

        <h2>Security reports</h2>
        <p>If you believe you have found a security issue, include the affected PicoSvc product, endpoint or feature, reproduction steps, and the potential impact. Please avoid accessing data that does not belong to you and do not include live secrets in the report.</p>
      </article>

      <footer className="shell"><span>PicoSvc</span><span><a href="/contact">Contact</a> · <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/tokushoho">Commercial Disclosure</a></span></footer>
    </main>
  );
}
