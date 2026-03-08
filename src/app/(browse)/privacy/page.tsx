export const metadata = { title: 'Privacy Policy' };

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
      <h1 className="font-display text-display-lg mb-8">Privacy Policy</h1>
      <div className="prose prose-sm text-muted-foreground space-y-6">
        <p>
          Mayells is committed to protecting your privacy. This policy explains how we collect,
          use, and safeguard your personal information.
        </p>
        <h2 className="font-display text-lg text-foreground">1. Information We Collect</h2>
        <p>
          We collect information you provide directly: name, email, phone, shipping address,
          and payment information. We also collect usage data through cookies and analytics.
        </p>
        <h2 className="font-display text-lg text-foreground">2. How We Use Your Information</h2>
        <p>
          Your information is used to process transactions, manage your account, send auction
          notifications, and improve our services. We do not sell your personal data.
        </p>
        <h2 className="font-display text-lg text-foreground">3. Data Security</h2>
        <p>
          We use industry-standard encryption and security measures to protect your data.
          Payment processing is handled securely through Stripe.
        </p>
        <h2 className="font-display text-lg text-foreground">4. Your Rights</h2>
        <p>
          You may request access to, correction of, or deletion of your personal data at any time
          by contacting us.
        </p>
        <h2 className="font-display text-lg text-foreground">5. Contact</h2>
        <p>
          For privacy inquiries, contact us at{' '}
          <a href="mailto:info@mayells.com" className="text-champagne hover:underline">info@mayells.com</a>.
        </p>
      </div>
    </div>
  );
}
