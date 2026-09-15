import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — PicoSvc',
  description: 'How PicoSvc collects, uses, and protects personal information.',
};

const EFFECTIVE_DATE = 'September 16, 2026';

export default function PrivacyPage() {
  return (
    <main>
      <nav className="nav shell">
        <a className="brand" href="/"><span className="brandMark">P</span><span>PicoSvc</span></a>
        <div className="navRight"><a href="/">Products</a><a href="/terms">Terms</a></div>
      </nav>

      <article className="legal shell">
        <div className="eyebrow"><span className="dot" /> Legal</div>
        <h1>Privacy Policy</h1>
        <p className="legalMeta">Effective {EFFECTIVE_DATE}</p>

        <p>This Privacy Policy explains how PicoSvc collects, uses, stores, and shares information when you use PicoSvc websites, APIs, dashboards, runtime endpoints, developer tools, and related services (collectively, the “Service”).</p>

        <h2>1. Information we collect</h2>
        <h3>Account and identity information</h3>
        <p>When you sign in, our authentication provider may provide identifiers and account details such as your user ID, organization ID, email address, profile information, session information, and authentication events.</p>

        <h3>Product and configuration data</h3>
        <p>We collect information needed to operate the PicoSvc products you use, including deployment metadata, repository references, branches, endpoint configuration, mock responses, webhook configuration, feed configuration, scheduled jobs, files, feature settings, and other product-specific data.</p>

        <h3>Source code, secrets, and service content</h3>
        <p>Some products may need to access source code, deployment configuration, environment variables, payloads, files, URLs, email content, webhook bodies, or other content you provide. We process that content only as needed to provide, secure, troubleshoot, and maintain the requested service. Where PicoSvc supports stored deployment secrets, those secrets are intended to be encrypted at rest and are not returned in plaintext by management APIs.</p>

        <h3>Usage and technical data</h3>
        <p>We may collect request counts, build counts, product usage, timestamps, IP addresses, user-agent information, error logs, security events, rate-limit data, diagnostic information, and similar technical information needed to operate and protect the Service.</p>

        <h3>Billing information</h3>
        <p>If you purchase a paid product plan or bundle, our billing or payment provider may process payment-card details, billing address, tax information, subscription status, invoices, and transaction identifiers. PicoSvc generally receives subscription and payment status rather than full payment-card numbers.</p>

        <h3>Connected third-party services</h3>
        <p>If you connect a service such as GitHub, we may receive repository identifiers, installation information, account identifiers, authorization metadata, and data necessary to perform the actions you request. Short-lived access credentials may be used to retrieve private repository content when required.</p>

        <h2>2. How we use information</h2>
        <p>We use information to provide and operate PicoSvc; authenticate users; enforce product plans, bundles, quotas, and rate limits; deploy and run services; process requests; troubleshoot failures; secure accounts and infrastructure; prevent fraud and abuse; communicate service changes; process billing; comply with legal obligations; and improve reliability and product design.</p>
        <p>We do not sell personal information. We do not use private service content such as repository code, secrets, webhook payloads, or files for third-party targeted advertising.</p>

        <h2>3. Product plans and bundles</h2>
        <p>PicoSvc products are normally subscribed to separately. We store product-level entitlement and usage information so that access to one product does not automatically grant access to another. If you purchase a bundle, we may store bundle identifiers and the product entitlements granted by that bundle.</p>

        <h2>4. Service providers and sharing</h2>
        <p>We may share information with vendors that help us provide the Service, such as authentication providers, cloud infrastructure providers, source-code hosts, observability providers, email providers, and payment processors. These providers may process information on our behalf under their own contractual and security obligations.</p>
        <p>We may also disclose information when reasonably necessary to comply with law, respond to valid legal process, protect users or the public, investigate abuse or security incidents, enforce our Terms, or complete a merger, acquisition, financing, reorganization, or sale of assets subject to appropriate protections.</p>

        <h2>5. International processing</h2>
        <p>PicoSvc and its service providers may process information in countries other than the country where you live. Those countries may have different data-protection laws. Where required, we use reasonable mechanisms intended to support lawful cross-border processing.</p>

        <h2>6. Retention</h2>
        <p>We retain account, product, billing, security, and usage information for as long as reasonably necessary to provide the Service, maintain security, resolve disputes, meet accounting or legal obligations, and enforce agreements. Product content may be deleted when you delete the associated resource or account, subject to reasonable backup, recovery, fraud-prevention, and legal-retention periods.</p>
        <p>Temporary build data, runtime files, short-lived access tokens, caches, and logs may have shorter retention periods depending on the product and infrastructure provider.</p>

        <h2>7. Security</h2>
        <p>We use technical and organizational safeguards designed to protect information, including access controls, encrypted transport, isolation of untrusted workloads where appropriate, credential hashing or encryption where supported, and rate limiting. No system is perfectly secure, and we cannot guarantee that unauthorized access, loss, or misuse will never occur.</p>

        <h2>8. Your choices and rights</h2>
        <p>Depending on where you live, you may have rights to request access to, correction of, deletion of, restriction of, or information about certain personal data. You may also be able to withdraw consent or object to certain processing where applicable. We may need to verify your identity before fulfilling a request, and some information may be retained where legally permitted or required.</p>
        <p>You can remove many product resources directly through the Service. You can also disconnect third-party integrations through PicoSvc or the third party where available.</p>

        <h2>9. Cookies and similar technologies</h2>
        <p>PicoSvc and its authentication or infrastructure providers may use cookies, local storage, or similar technologies for sign-in, security, session management, preferences, abuse prevention, and core functionality. We may also use limited analytics to understand aggregate Service usage.</p>

        <h2>10. Children</h2>
        <p>The Service is intended for developers and organizations and is not directed to children who cannot lawfully consent to the processing of their personal information or enter into the applicable Terms. If you believe a child has provided personal information without appropriate authorization, contact us through the private support channel displayed in the Service.</p>

        <h2>11. Changes to this Policy</h2>
        <p>We may update this Privacy Policy as PicoSvc adds products, providers, or legal requirements. We will update the effective date above and provide additional notice when a change materially affects how we handle personal information.</p>

        <h2>12. Contact</h2>
        <p>For privacy questions or data-rights requests, use the private contact or support channel displayed on the PicoSvc website or in your account dashboard. Do not send passwords, private keys, API secrets, or other sensitive credentials in a support request.</p>
      </article>

      <footer className="shell"><span>PicoSvc</span><span><a href="/terms">Terms</a> · <a href="/privacy">Privacy</a></span></footer>
    </main>
  );
}
