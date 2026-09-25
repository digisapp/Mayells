import { BUSINESS } from '@/lib/config';

export const metadata = {
  title: 'Privacy Policy',
  description: 'Learn how Mayells collects, uses, and protects your personal information. Your privacy and data security are our priority.',
};

// No typography plugin is installed, so the policy is styled directly:
// 15–16px body, spaced headings, list markers, and wrapping for long addresses.
// The link's vertical padding widens its tap area without moving the text.
export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
      <h1 className="font-display text-display-lg mb-6 sm:mb-8">Privacy Policy</h1>
      <div className="space-y-4 text-[15px] sm:text-base leading-relaxed text-muted-foreground break-words [&_h2]:pt-4 [&_h2]:font-display [&_h2]:text-xl [&_h2]:leading-snug [&_h2]:text-foreground [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
        <p>
          Mayells is committed to protecting your privacy. This policy explains how we collect,
          use, and safeguard your personal information.
        </p>
        <h2>1. Information We Collect</h2>
        <p>
          We collect information you provide directly: name, email, phone, shipping address,
          and payment information. We also collect usage data through cookies and analytics.
        </p>
        <h2>2. How We Use Your Information</h2>
        <p>
          Your information is used to process transactions, manage your account, send auction
          notifications, and improve our services. We do not sell your personal data.
        </p>
        <h2>3. Data Security</h2>
        <p>
          We use industry-standard encryption and security measures to protect your data.
          Payment processing is handled securely through Stripe.
        </p>
        <h2>4. Your Rights</h2>
        <p>
          You may request access to, correction of, or deletion of your personal data at any time
          by contacting us.
        </p>
        <h2>5. Contact</h2>
        <p>
          For privacy inquiries, contact us at{' '}
          <a
            href={`mailto:${BUSINESS.email}`}
            className="py-2 font-medium text-champagne-deep underline decoration-champagne/60 underline-offset-4 hover:decoration-champagne-deep"
          >
            {BUSINESS.email}
          </a>
          .
        </p>
      </div>
    </div>
  );
}
