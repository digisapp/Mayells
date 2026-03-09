export const metadata = { title: 'About' };

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="font-display text-display-lg mb-8">About Mayell</h1>
      <div className="prose prose-lg max-w-none space-y-6 text-muted-foreground">
        <p>
          Mayell is a full-service auction house where collectors, dealers, and enthusiasts
          discover and acquire extraordinary objects across art, antiques, luxury, fashion,
          jewelry, and design.
        </p>
        <p>
          We combine the prestige and curation of traditional auction houses with
          modern technology: real-time bidding, expert cataloging and appraisal,
          and live streaming auction events.
        </p>
        <h2 className="font-display text-display-sm text-foreground">How to Bid</h2>
        <ol className="list-decimal pl-6 space-y-3">
          <li>Create a free account and browse our upcoming auctions.</li>
          <li>Find a lot you love and place a bid at or above the minimum increment.</li>
          <li>Set a maximum bid and our system will bid for you up to that amount.</li>
          <li>If you&apos;re outbid, you&apos;ll receive a notification immediately.</li>
          <li>Win the lot, pay your invoice, and receive your item with insured shipping.</li>
        </ol>
        <h2 className="font-display text-display-sm text-foreground">Selling with Mayell</h2>
        <p>
          Have an extraordinary item to sell? Submit it for consignment through our
          platform. Our team reviews every submission and provides expert guidance on
          estimates and timing.
        </p>
      </div>
    </div>
  );
}
