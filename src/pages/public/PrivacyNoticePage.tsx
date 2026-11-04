import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ButtonLink } from '../../ui/Button';

export function PrivacyNoticePage() {
  return (
    <main className="min-h-dvh bg-canvas px-4 py-8 sm:px-6">
      <article className="mx-auto max-w-3xl rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-9">
        <ButtonLink to="/" variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4" />}>Back</ButtonLink>
        <header className="mt-5">
          <p className="text-sm font-semibold text-brand-700">Pinnacle Financial Services</p>
          <h1 className="mt-2 text-3xl font-bold text-ink">Privacy Notice</h1>
          <p className="mt-2 text-sm text-ink-muted">Effective date: 4 November 2026</p>
        </header>

        <div className="mt-8 space-y-4 text-sm leading-6 text-ink [&_h2]:pt-3 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:leading-7 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">
          <h2>1. Who is responsible</h2>
          <p>Pinnacle Financial Services is the data controller for this lending portal. The data controller decides why and how your personal information is processed.</p>
          <p>For privacy questions or requests, contact Pinnacle Financial Services through its official contact channels and ask for the person responsible for privacy matters.</p>

          <h2>2. Information we collect</h2>
          <p>When you use the portal, we may collect:</p>
          <ul>
            <li><strong>Identity and contact details:</strong> name, email address, telephone number, national ID number, date of birth, address, and district.</li>
            <li><strong>Employment and financial details:</strong> employer, employee number, income, loan applications, assessments, offers, repayments, and transaction information.</li>
            <li><strong>Business details:</strong> business information, ownership or representative relationships, financial figures, and supporting evidence.</li>
            <li><strong>Documents:</strong> identity, payroll, business, and other files you upload.</li>
            <li><strong>Account and security information:</strong> password records, sign-in and session details, passkey public keys, and security logs.</li>
            <li><strong>Portal activity:</strong> messages, notifications, application decisions, and records of actions taken in the portal.</li>
          </ul>
          <p>Please provide information about another person only when you are authorized to do so.</p>

          <h2>3. Why we use your information</h2>
          <p>We use personal information to:</p>
          <ul>
            <li>Create and protect your account.</li>
            <li>Verify your identity, membership, and business details.</li>
            <li>Receive and assess loan applications.</li>
            <li>Communicate with you and prepare loan offers.</li>
            <li>Record and confirm disbursements and repayments.</li>
            <li>Provide customer support.</li>
            <li>Protect the portal, investigate security issues, and maintain audit and operational records.</li>
          </ul>
          <p>Pinnacle Financial Services will identify and document the lawful basis for each use, as required by applicable law. Depending on the purpose, processing may be necessary to take steps you request before entering a contract, perform a contract, meet a legal obligation, protect vital interests, perform a public-interest task, or pursue a legitimate interest such as account security. Where consent is the applicable basis, it will be requested separately. This notice is not itself a request for consent.</p>

          <h2>4. Loan assessments and automated decisions</h2>
          <p>The portal calculates financial indicators to support staff assessments. It does not itself approve or reject loan applications. Staff review applications and record decisions. The portal does not make decisions solely through automated processing.</p>

          <h2>5. Who may access your information</h2>
          <p>Authorized staff may access information needed for their work. Access to uploaded documents and important administrative and lending actions is recorded.</p>
          <p>Depending on the services enabled, information may also be processed by providers of hosting, email, SMS, or other technical services. Pinnacle Financial Services will identify the providers used in its live service.</p>

          <h2>6. Storage and security</h2>
          <p>Uploaded documents are stored outside the public web directory and are available only after authentication and authorization checks. The portal applies access controls and records document uploads, views, and downloads. These measures reduce risk but cannot guarantee absolute security.</p>
          <p>The location where information is stored depends on the hosting environment used for the service. If a provider processes or stores information outside Malawi, Pinnacle Financial Services will handle that transfer in accordance with applicable requirements.</p>

          <h2>7. How long we keep information</h2>
          <p>Pinnacle Financial Services will retain personal information only as long as needed for the purposes described in this notice or as required by law, and then securely delete or anonymize it.</p>
          <p>Some documents deleted through the portal may remain in storage until they can be securely purged. Retention periods depend on the type of information and applicable legal obligations.</p>

          <h2>8. Your rights</h2>
          <p>Subject to applicable law, you may ask Pinnacle Financial Services to:</p>
          <ul>
            <li>Confirm whether your personal information is being processed and request access to it.</li>
            <li>Correct inaccurate or incomplete information.</li>
            <li>Provide a portable copy of your information where applicable.</li>
            <li>Erase or restrict processing of information in qualifying circumstances.</li>
            <li>Consider an objection to certain processing.</li>
            <li>Address a complaint about how your information is handled.</li>
          </ul>
          <p>Some information may need to be retained to meet legal obligations or to establish, exercise, or defend legal claims. Contact Pinnacle Financial Services through its official contact channels and ask for the person responsible for privacy matters.</p>

          <h2>9. Complaints</h2>
          <p>You may raise a privacy concern with Pinnacle Financial Services through its official contact channels. You may also contact the <a href="https://www.dpa.mw/" target="_blank" rel="noreferrer">Malawi Data Protection Authority</a>.</p>

          <h2>10. Changes to this notice</h2>
          <p>Pinnacle Financial Services may update this notice when its practices, services, or legal obligations change. The effective date will be updated when a new version is issued.</p>
        </div>

        <footer className="mt-8 border-t border-line pt-4 text-sm text-ink-muted">
          <Link className="font-semibold text-brand-700 hover:underline" to="/register">Create an account</Link>
        </footer>
      </article>
    </main>
  );
}
