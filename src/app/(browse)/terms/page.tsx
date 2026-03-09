export const metadata = { title: 'Terms of Service' };

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
      <h1 className="font-display text-display-lg mb-8">Terms of Service</h1>
      <div className="prose prose-sm text-muted-foreground space-y-6">
        <p>
          These Terms of Service govern your use of the Mayell platform. By accessing or using our services,
          you agree to be bound by these terms.
        </p>
        <h2 className="font-display text-lg text-foreground">1. Use of Services</h2>
        <p>
          You must be at least 18 years old to use our platform. You are responsible for maintaining
          the security of your account credentials.
        </p>
        <h2 className="font-display text-lg text-foreground">2. Bidding & Purchases</h2>
        <p>
          All bids are binding. By placing a bid, you agree to purchase the item at the bid amount
          if you are the winning bidder. Buyer&apos;s premiums may apply.
        </p>
        <h2 className="font-display text-lg text-foreground">3. Consignment</h2>
        <p>
          Consigned items are subject to review and approval. Commission rates are agreed upon
          prior to listing. Mayell reserves the right to decline any consignment.
        </p>
        <h2 className="font-display text-lg text-foreground">4. Limitation of Liability</h2>
        <p>
          Mayell provides descriptions and estimates in good faith but does not guarantee
          the accuracy of any lot description, authenticity attribution, or condition report.
        </p>
        <h2 className="font-display text-lg text-foreground">5. Contact</h2>
        <p>
          For questions about these terms, contact us at{' '}
          <a href="mailto:info@mayellauctions.com" className="text-champagne hover:underline">info@mayellauctions.com</a>.
        </p>
      </div>
    </div>
  );
}
