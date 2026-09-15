import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — PicoSvc',
  description: 'Terms governing use of PicoSvc developer services.',
};

const EFFECTIVE_DATE = 'September 16, 2026';

export default function TermsPage() {
  return (
    <main>
      <nav className="nav shell">
        <a className="brand" href="/"><span className="brandMark">P</span><span>PicoSvc</span></a>
        <div className="navRight"><a href="/">Products</a><a href="/privacy">Privacy</a></div>
      </nav>

      <article className="legal shell">
        <div className="eyebrow"><span className="dot" /> Legal</div>
        <h1>Terms of Service</h1>
        <p className="legalMeta">Effective {EFFECTIVE_DATE}</p>

        <p>These Terms of Service (the “Terms”) govern access to and use of PicoSvc websites, APIs, dashboards, runtime endpoints, developer tools, and related services (collectively, the “Service”). By creating an account, purchasing a plan, or using the Service, you agree to these Terms.</p>

        <h2>1. Accounts and eligibility</h2>
        <p>You must be legally able to enter into these Terms. If you use the Service for an organization, you represent that you are authorized to act for that organization. You are responsible for your account, API tokens, deployment credentials, connected repositories, and all activity performed through them. Keep credentials secure and promptly rotate credentials you believe may have been exposed.</p>

        <h2>2. PicoSvc products, separate plans, and bundles</h2>
        <p>PicoSvc consists of multiple developer services. Unless a checkout page expressly says otherwise, each product is sold and metered separately. Purchasing a plan for one product does not automatically upgrade or unlock another product.</p>
        <p>PicoSvc may also offer bundles that include specified plans or quotas for multiple products at a combined price. A bundle grants only the products and limits shown at purchase. If a standalone product plan and a bundle overlap, the Service may apply the higher applicable entitlement for that product, subject to the checkout terms for that offer.</p>
        <p>Product features, quotas, prices, taxes, billing intervals, and included usage are the values shown on the applicable pricing or checkout page at the time of purchase. Free plans and trial features may have lower limits or additional restrictions.</p>

        <h2>3. Billing, renewal, cancellation, and refunds</h2>
        <p>Paid subscriptions renew automatically for the billing period shown at checkout until cancelled. You authorize PicoSvc and its payment processor to charge applicable fees and taxes using your selected payment method. You may cancel a subscription through the available billing controls; cancellation normally takes effect at the end of the paid billing period unless the checkout flow states otherwise.</p>
        <p>Fees are non-refundable except where required by law or where PicoSvc expressly states otherwise. We may change future pricing or plan contents. Material changes to a recurring paid plan will be communicated through the Service or another reasonable channel before they take effect for a future renewal.</p>

        <h2>4. Usage limits and service protection</h2>
        <p>Plans may include limits on requests, endpoints, deployments, builds, storage, execution time, bandwidth, events, or other resources. We may rate-limit, delay, reject, pause, or suspend usage that exceeds the purchased limits or threatens the reliability or security of the Service. We may impose reasonable technical limits to prevent abuse even where a plan does not display a specific limit.</p>

        <h2>5. Acceptable use</h2>
        <p>You may not use the Service to violate law, infringe intellectual property or privacy rights, distribute malware, steal credentials, conduct unauthorized security testing, send unlawful or abusive spam, evade platform restrictions, operate deceptive or fraudulent systems, interfere with other users, attack third-party systems, or consume resources in a manner intended to degrade or circumvent the Service. You may not use PicoSvc to access or process third-party systems or data unless you have permission to do so.</p>
        <p>Some products can execute user-supplied code or forward user-supplied traffic. You are responsible for the code, endpoints, payloads, recipients, data sources, and third-party terms associated with your use.</p>

        <h2>6. Your content and code</h2>
        <p>You retain ownership of repositories, code, files, payloads, mock responses, configuration, and other content you submit to the Service (“User Content”). You grant PicoSvc a limited, non-exclusive license to host, copy, transmit, cache, transform, execute, and otherwise process User Content only as reasonably necessary to provide, secure, troubleshoot, and improve the Service.</p>
        <p>You represent that you have the rights needed to submit and process User Content through PicoSvc. You are responsible for backups of important data and for removing secrets or personal data that are not needed for the Service.</p>

        <h2>7. Third-party services</h2>
        <p>PicoSvc may integrate with third parties such as identity providers, cloud infrastructure providers, source-code hosts, payment processors, or external APIs. Your use of those third-party services may also be governed by their terms. PicoSvc is not responsible for outages, policy changes, account restrictions, or other acts of third-party providers outside PicoSvc’s reasonable control.</p>

        <h2>8. Security and beta functionality</h2>
        <p>We use reasonable technical and organizational measures designed to protect the Service, but no online service can guarantee absolute security or uninterrupted operation. Some PicoSvc products or features may be labeled beta, preview, experimental, or early access. Such features may change, fail, or be discontinued without the same notice or support expectations as generally available features.</p>

        <h2>9. Suspension and termination</h2>
        <p>You may stop using the Service at any time. We may suspend or terminate access where reasonably necessary to address non-payment, security risk, abusive behavior, legal obligations, material breach of these Terms, or danger to other users or systems. Where practical, we will provide notice and an opportunity to resolve the issue.</p>

        <h2>10. Changes to the Service</h2>
        <p>We may add, remove, or modify features, plans, quotas, integrations, domains, or runtime behavior. We will use reasonable efforts to avoid materially disrupting paid functionality without notice, but we do not promise that every feature will remain available permanently.</p>

        <h2>11. Disclaimers</h2>
        <p>To the maximum extent permitted by law, the Service is provided on an “as is” and “as available” basis. PicoSvc disclaims implied warranties of merchantability, fitness for a particular purpose, non-infringement, and uninterrupted or error-free operation. PicoSvc does not guarantee that generated outputs, remote conversions, screenshots, fetched content, scheduled jobs, webhooks, or third-party integrations will always be complete, accurate, timely, or available.</p>

        <h2>12. Limitation of liability</h2>
        <p>To the maximum extent permitted by law, PicoSvc will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits, revenue, data, goodwill, or business opportunities. PicoSvc’s aggregate liability arising from the Service will not exceed the greater of the amount you paid to PicoSvc for the affected Service during the 12 months before the event giving rise to the claim or USD 100. This section does not limit liability that cannot legally be limited.</p>

        <h2>13. Indemnity</h2>
        <p>To the extent permitted by law, you agree to be responsible for claims, losses, or costs arising from your unlawful use of the Service, your User Content, or your violation of third-party rights or these Terms.</p>

        <h2>14. Governing law and disputes</h2>
        <p>These Terms are governed by the laws of Japan, without regard to conflict-of-law rules. Unless mandatory law requires otherwise, the Tokyo District Court will have exclusive jurisdiction over disputes arising from these Terms or the Service.</p>

        <h2>15. Changes to these Terms</h2>
        <p>We may update these Terms as the Service evolves. The effective date above will be updated when changes are posted. If a change materially affects your rights under a paid subscription, we will provide reasonable notice through the Service or another appropriate channel.</p>

        <h2>16. Contact</h2>
        <p>For legal or support questions, use the contact or support channel displayed in the PicoSvc website or account dashboard. Do not include passwords, private keys, API secrets, or other sensitive credentials in support messages.</p>
      </article>

      <footer className="shell"><span>PicoSvc</span><span><a href="/terms">Terms</a> · <a href="/privacy">Privacy</a></span></footer>
    </main>
  );
}
