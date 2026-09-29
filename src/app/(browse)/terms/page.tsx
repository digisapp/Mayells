import Link from 'next/link';
import { BUSINESS } from '@/lib/config';

export const metadata = {
  title: 'Terms of Service',
  description:
    'Terms of Service and Conditions of Sale for Mayells: where sales are bid, buyer’s premium, payment, collection and consignment.',
};

const LINK = 'font-medium text-champagne-deep underline decoration-champagne/60 underline-offset-4 hover:decoration-champagne-deep';

// Styled directly (no typography plugin); matches the privacy policy.
// The Conditions of Sale describe how the platform actually works: one bidding
// venue per sale (lib/bidding/venue.ts), the bidder tiers in
// lib/bidding/verification.ts, the per-sale buyer's premium, the invoice due
// period in automation settings (7 days by default) and the anti-snipe
// extension. Change the text with the code.
export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
      <h1 className="font-display text-display-lg">Terms of Service</h1>
      {/* The date of this file's last substantive change — update with the text. */}
      <p className="mt-3 mb-6 sm:mb-8 text-sm text-muted-foreground">Last updated September 29, 2026</p>

      <div className="space-y-4 text-[15px] sm:text-base leading-relaxed text-muted-foreground break-words [&_h2]:pt-6 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:leading-snug [&_h2]:text-foreground [&_h3]:pt-3 [&_h3]:font-medium [&_h3]:text-foreground [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_section]:scroll-mt-24 [&_section]:space-y-4">
        <p>
          These terms govern your use of mayells.com and any purchase or sale made through Mayells.
          Part 2, the Conditions of Sale, applies whenever you bid in or buy from a Mayells sale. By
          using the site, registering, bidding or buying, you agree to them.
        </p>

        <nav aria-label="Contents" className="rounded-xl border border-border/60 p-5">
          <p className="font-medium text-foreground">Contents</p>
          {/* An <ol>, so the page's bulleted-list styling doesn't apply. */}
          <ol className="mt-1">
            <li><a href="#using-mayells" className={`inline-flex min-h-10 items-center ${LINK}`}>1. Using Mayells</a></li>
            <li><a href="#conditions-of-sale" className={`inline-flex min-h-10 items-center ${LINK}`}>2. Conditions of Sale</a></li>
            <li><a href="#consigning" className={`inline-flex min-h-10 items-center ${LINK}`}>3. Consigning with Mayells</a></li>
            <li><a href="#general" className={`inline-flex min-h-10 items-center ${LINK}`}>4. General</a></li>
          </ol>
        </nav>

        <section id="using-mayells">
          <h2>1. Using Mayells</h2>
          <h3>Accounts</h3>
          <p>
            You must be at least 18 to register or bid. Give accurate information, keep your password
            private and tell us promptly if you think someone else has used your account. You are
            responsible for activity on your account, including bids.
          </p>
          <h3>Fair use</h3>
          <p>
            Don&rsquo;t misuse the site: no bidding to inflate prices, no bidding on lots you consigned
            or on behalf of their consignor, no collusion between bidders, no multiple accounts to get
            around bidding limits, and no scraping, automated bidding tools or attempts to interfere
            with the service. We may cancel bids, suspend or close accounts that break these rules.
          </p>
          <h3>Content</h3>
          <p>
            Catalogue text, photographs and site design belong to Mayells or the people who licensed
            them to us. You may share links and view them for personal use, but not copy them for
            commercial use without permission.
          </p>
        </section>

        <section id="conditions-of-sale">
          <h2>2. Conditions of Sale</h2>

          <h3>2.1 Mayells as agent</h3>
          <p>
            Mayells sells as agent for the consignor (the seller). When a lot is sold, the contract of
            sale is between the buyer and the seller; Mayells manages the sale, invoicing, payment and
            release of the lot.
          </p>

          <h3>2.2 Where each sale is bid</h3>
          <p>
            Every sale takes bids in one place only: either here on mayells.com or on LiveAuctioneers.
            The sale&rsquo;s page says which and links to it. A lot is never open for bidding in both
            places at once. For sales bid on LiveAuctioneers, its terms of use and any fees it charges
            also apply; these Conditions of Sale govern your purchase from Mayells.
          </p>

          <h3>2.3 Registration and bidding limits (mayells.com)</h3>
          <ul>
            <li>With a verified email address you may bid up to $1,000 on a lot.</li>
            <li>
              Verifying a payment card (no charge is made) lets you bid up to $24,999 on a lot.
            </li>
            <li>Bids of $25,000 or more need identity verification.</li>
          </ul>
          <p>
            We may ask for further information, set a deposit or limit, or decline any bidder at our
            discretion.
          </p>

          <h3>2.4 Bids</h3>
          <p>
            Every bid is a binding offer to buy the lot at that amount plus the buyer&rsquo;s premium,
            any tax and any shipping. Bids can&rsquo;t be withdrawn once placed. If you leave a maximum
            bid, it bids for you automatically, only as high as needed to keep you in the lead, up to
            your maximum. Your maximum stays confidential. Bidding increments are set by the platform
            and shown when you bid.
          </p>

          <h3>2.5 Timed sales and closing</h3>
          <p>
            In a timed sale, lots close one after another at the times shown. A bid placed in a lot&rsquo;s
            final minutes may extend that lot&rsquo;s closing time by a few minutes so other bidders can
            respond. The sale platform&rsquo;s clock and records decide the order of bids and the time a
            lot closes. The highest bid accepted when a lot closes is the winning bid, subject to any
            reserve.
          </p>

          <h3>2.6 Reserves</h3>
          <p>
            Many lots are offered subject to a confidential reserve, the minimum price agreed with the
            consignor. A lot whose reserve is not met may go unsold.
          </p>

          <h3>2.7 Our discretion</h3>
          <p>
            Mayells may withdraw any lot before or during a sale, divide or combine lots, and refuse any
            bid. If there is a dispute, a clear error (for example, a technical fault or a mistake in a
            lot&rsquo;s description or estimate) or a reasonable suspicion of fraud, we may reopen
            bidding, re-offer the lot, or cancel the sale of that lot, and our decision is final.
          </p>

          <h3>2.8 Estimates, descriptions and condition</h3>
          <p>
            Estimates are our opinion of a likely price range, not a prediction or guarantee. Descriptions,
            attributions, dates, provenance and condition reports are statements of opinion made in good
            faith, and photographs may not show every flaw. Lots are sold &ldquo;as is&rdquo;, in the
            condition they are in at the time of sale. Please ask for a condition report or additional
            photographs before you bid; you bid on the basis of your own judgement. Except as the law
            requires, Mayells and the seller give no warranty about a lot&rsquo;s authorship,
            authenticity, origin, age, condition or fitness for any purpose.
          </p>

          <h3>2.9 Buyer&rsquo;s premium</h3>
          <p>
            The buyer pays the hammer price plus a buyer&rsquo;s premium, a percentage of the hammer price
            shown on each sale&rsquo;s page: 25% unless that page states a different rate.
          </p>

          <h3>2.10 Taxes</h3>
          <p>
            The buyer is responsible for any sales, use or other tax that applies to the purchase. Where
            Mayells is required to collect tax, it is shown on the invoice. If you are exempt, send us a
            valid resale or exemption certificate before paying.
          </p>

          <h3>2.11 Invoices and payment</h3>
          <p>
            Winning bidders are sent an invoice after the sale. Payment in full, in US dollars, is due
            within seven (7) days of the invoice date unless the invoice says otherwise. You can pay by
            card through the secure checkout linked from your invoice, or by bank wire; other methods only
            by prior arrangement. For sales bid on LiveAuctioneers, your invoice may be issued through
            LiveAuctioneers and will say how to pay.
          </p>

          <h3>2.12 If a buyer doesn&rsquo;t pay</h3>
          <p>
            If payment isn&rsquo;t received when due, Mayells may, as the law allows: cancel the sale,
            re-offer the lot and hold the defaulting buyer responsible for any shortfall and our costs,
            refuse or restrict future bids, and pursue any amount owed.
          </p>

          <h3>2.13 Ownership and risk</h3>
          <p>
            Ownership passes to the buyer once we have received payment in full in cleared funds. Until
            then the lot is not released. Risk of loss or damage passes to the buyer when the lot is
            collected or handed to the buyer&rsquo;s shipper, or fourteen (14) days after payment,
            whichever comes first.
          </p>

          <h3>2.14 Collection and shipping</h3>
          <p>
            Shipping, packing, insurance in transit and any import or export duties are the buyer&rsquo;s
            responsibility and cost. We can arrange shipping through fine-art and antiques shippers
            worldwide, and quote it after the sale; local collection is available by appointment. Some
            materials (for example ivory, tortoiseshell or certain woods) may need permits to export or
            import, and obtaining them is the buyer&rsquo;s responsibility; a delay or refusal
            doesn&rsquo;t cancel the sale or delay payment.
          </p>

          <h3>2.15 Fixed-price (Gallery) purchases</h3>
          <p>
            Gallery pieces are offered at the price shown. A purchase is agreed with a Mayells specialist,
            who confirms availability and sends an invoice. The price shown is payable plus any tax and
            shipping, with no buyer&rsquo;s premium unless the listing says otherwise. Sections 2.8 and
            2.10&ndash;2.14 apply to Gallery purchases too.
          </p>

          <h3>2.16 Returns</h3>
          <p>
            All sales are final, except where the law requires otherwise. If there&rsquo;s a problem with
            a lot you bought, contact us promptly and we&rsquo;ll look into it.
          </p>
        </section>

        <section id="consigning">
          <h2>3. Consigning with Mayells</h2>
          <p>
            Selling through Mayells is governed by the written consignment agreement each consignor signs,
            which sets out the commission, reserves, consignment period, withdrawal and payment. You can
            read our{' '}
            <Link href="/consignment-agreement" className={LINK}>standard consignment agreement</Link>.
            We may decline any consignment.
          </p>
          <p>
            Free estimates, including any estimate prepared with the help of software, are informal
            auction estimates of what an item might sell for. They are not formal appraisals and should
            not be used for insurance, tax, estate or probate purposes.
          </p>
        </section>

        <section id="general">
          <h2>4. General</h2>
          <h3>Liability</h3>
          <p>
            To the extent the law allows, Mayells is not liable for indirect or consequential loss, and
            our total liability to a buyer in connection with a lot is limited to the amount the buyer
            paid for it. Nothing in these terms limits liability that the law does not allow to be
            limited.
          </p>
          <h3>Privacy</h3>
          <p>
            How we handle personal information is described in our{' '}
            <Link href="/privacy" className={LINK}>Privacy Policy</Link>.
          </p>
          <h3>Governing law</h3>
          <p>
            These terms are governed by the laws of the State of Florida. Any dispute will be heard in
            the state or federal courts located in Palm Beach County, Florida.
          </p>
          <h3>Changes</h3>
          <p>
            We may update these terms; the date at the top shows the latest version. The terms in force
            when you place a bid apply to that sale.
          </p>
          <h3>Contact</h3>
          <p>
            Questions about these terms:{' '}
            <a href={`mailto:${BUSINESS.email}`} className={`py-2 ${LINK}`}>
              {BUSINESS.email}
            </a>{' '}
            or{' '}
            <a href={BUSINESS.phoneHref} className={`py-2 ${LINK}`}>
              {BUSINESS.phone}
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
