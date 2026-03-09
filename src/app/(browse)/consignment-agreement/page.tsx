import { BUSINESS } from '@/lib/config';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: `Consignment Agreement | ${BUSINESS.name}`,
  description: `Review the ${BUSINESS.name} consignment agreement for selling items at auction.`,
};

export default function ConsignmentAgreementPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20">
      <h1 className="font-display text-display-md text-center mb-2">{BUSINESS.name}</h1>
      <h2 className="font-display text-display-sm text-center text-champagne mb-12">Consignment Agreement</h2>

      <div className="prose prose-sm max-w-none text-foreground/80 space-y-6 [&_h3]:font-display [&_h3]:text-lg [&_h3]:text-foreground [&_h3]:mt-8 [&_h3]:mb-3 [&_p]:leading-relaxed [&_ol]:space-y-2 [&_li]:leading-relaxed">

        <p className="text-sm text-muted-foreground italic">
          Effective Date: This Agreement is entered into as of the date signed below.
        </p>

        <p>
          This Consignment Agreement (&ldquo;Agreement&rdquo;) is made between <strong>{BUSINESS.name}</strong> (&ldquo;Auction House&rdquo;),
          located in Palm Beach County, Florida, and the undersigned consignor (&ldquo;Consignor&rdquo; or &ldquo;Seller&rdquo;).
          By signing this Agreement, the Consignor agrees to the following terms and conditions governing
          the consignment and sale of personal property at auction.
        </p>

        <h3>1. Consignment of Property</h3>
        <p>
          The Consignor hereby consigns and delivers to the Auction House the items described on the
          attached inventory schedule (the &ldquo;Property&rdquo;) for sale at public auction, private sale, or
          online auction at the Auction House&rsquo;s discretion. The Consignor represents and warrants that
          they are the lawful owner of all consigned Property, that the Property is free and clear of
          all liens, claims, and encumbrances, and that the Consignor has full authority to sell the Property.
        </p>

        <h3>2. Commission and Fees</h3>
        <ol className="list-[lower-alpha] pl-6">
          <li>
            <strong>Seller&rsquo;s Commission:</strong> The Auction House shall retain a commission of
            <strong> thirty-five percent (35%)</strong> of the gross hammer price (the final bid price)
            for each item sold. This commission is non-negotiable unless otherwise agreed in a separate written addendum.
          </li>
          <li>
            <strong>Buyer&rsquo;s Premium:</strong> The Auction House may charge buyers a separate
            buyer&rsquo;s premium, which is retained entirely by the Auction House and does not affect
            the Consignor&rsquo;s proceeds.
          </li>
          <li>
            <strong>Additional Fees:</strong> The Consignor may be responsible for reasonable costs
            incurred in connection with the sale, including but not limited to: photography, cataloging,
            shipping, framing, restoration, storage (if items remain uncollected beyond 30 days after
            the sale), and any applicable sales tax or regulatory fees. Such fees will be disclosed in
            advance and deducted from proceeds.
          </li>
          <li>
            <strong>Unsold Lots:</strong> For items that fail to sell, a buy-back fee of up to 5% of
            the low estimate may apply to cover cataloging and marketing costs.
          </li>
        </ol>

        <h3>3. Reserve Price</h3>
        <p>
          The Consignor and Auction House may mutually agree upon a confidential minimum price
          (&ldquo;Reserve&rdquo;) below which the Property will not be sold. The Reserve shall not exceed
          the low auction estimate unless otherwise agreed. If no Reserve is set, the Property will be
          sold to the highest bidder regardless of price (&ldquo;absolute auction&rdquo;). The Auction House
          reserves the right, at its sole discretion, to sell an item below the Reserve by up to 10%
          if it believes doing so is in the best interest of the Consignor.
        </p>

        <h3>4. Estimates and Descriptions</h3>
        <p>
          The Auction House will provide pre-sale estimates based on its professional judgment, market
          conditions, and comparable sales. Estimates are opinions of value and are not guarantees of
          the final sale price. The Auction House shall prepare catalog descriptions, photographs, and
          condition reports at its discretion. The Consignor should review all descriptions for accuracy
          prior to publication and notify the Auction House of any errors.
        </p>

        <h3>5. Payment to Consignor</h3>
        <ol className="list-[lower-alpha] pl-6">
          <li>
            <strong>Settlement:</strong> Payment of net proceeds (hammer price less commission and any
            applicable fees) will be made to the Consignor within <strong>thirty-five (35) business days</strong> following
            the date of the auction, provided the buyer has paid in full.
          </li>
          <li>
            <strong>Delayed Payment:</strong> If a buyer defaults on payment, the Auction House will
            use commercially reasonable efforts to collect payment but shall not be liable to the
            Consignor for the buyer&rsquo;s failure to pay. Settlement to the Consignor will be made
            only upon receipt of funds from the buyer.
          </li>
          <li>
            <strong>Itemized Statement:</strong> The Auction House will provide the Consignor with a
            detailed statement showing the hammer price, commission, fees, and net proceeds for each item sold.
          </li>
        </ol>

        <h3>6. Insurance and Liability</h3>
        <ol className="list-[lower-alpha] pl-6">
          <li>
            <strong>Insurance Coverage:</strong> From the time the Property is received by the Auction
            House until it is either sold and delivered to the buyer, returned to the Consignor, or
            otherwise disposed of, the Auction House will maintain insurance coverage on the Property.
            Coverage shall be based on the mutually agreed low estimate or a reasonable fair market value.
          </li>
          <li>
            <strong>Limitation of Liability:</strong> In the event the Property is lost, stolen,
            damaged, or destroyed while in the Auction House&rsquo;s custody, the Auction House&rsquo;s
            liability shall not exceed the low auction estimate, less the applicable commission.
            The Auction House shall not be liable for damage resulting from inherent vice, gradual
            deterioration, war, nuclear event, or acts of God.
          </li>
          <li>
            <strong>Consignor&rsquo;s Insurance:</strong> The Consignor is encouraged to maintain their
            own insurance coverage on the Property until the sale is completed and proceeds are received.
          </li>
        </ol>

        <h3>7. Withdrawal and Cancellation</h3>
        <ol className="list-[lower-alpha] pl-6">
          <li>
            <strong>Withdrawal by Consignor:</strong> The Consignor may withdraw Property from sale at
            any time prior to the published catalog deadline by providing written notice. After the
            catalog deadline, a withdrawal fee of <strong>20% of the low estimate</strong> shall apply to
            cover marketing and preparation costs already incurred.
          </li>
          <li>
            <strong>Withdrawal by Auction House:</strong> The Auction House reserves the right to
            withdraw any item from sale at any time prior to the auction if, in its sole judgment,
            there is doubt as to authenticity, title, legality, or if the sale may subject the Auction
            House to liability. No withdrawal fee shall apply in such cases.
          </li>
        </ol>

        <h3>8. Authenticity and Title Guarantee</h3>
        <p>
          The Consignor warrants that the Property is authentic and as described, that the Consignor
          has good and marketable title, and that the sale of the Property will not violate any
          applicable law (including export/import regulations, cultural heritage laws, and sanctions).
          The Consignor shall indemnify and hold harmless the Auction House from any claims, losses,
          damages, costs, and expenses (including attorney&rsquo;s fees) arising from a breach of
          these warranties.
        </p>

        <h3>9. Term and Termination</h3>
        <ol className="list-[lower-alpha] pl-6">
          <li>
            This Agreement shall remain in effect for a period of <strong>six (6) months</strong> from
            the date of signing, during which time the Auction House will offer the Property for sale
            at one or more auctions.
          </li>
          <li>
            If the Property remains unsold after this period, the Consignor may retrieve the Property
            at their expense or authorize the Auction House to continue offering it for sale, reduce
            the Reserve, or dispose of it in a manner agreed upon by both parties.
          </li>
          <li>
            Unsold Property not collected within <strong>sixty (60) days</strong> of written notice
            may be subject to storage fees, re-auctioned at no Reserve, donated to charity, or
            otherwise disposed of at the Auction House&rsquo;s discretion.
          </li>
        </ol>

        <h3>10. Governing Law and Dispute Resolution</h3>
        <p>
          This Agreement shall be governed by and construed in accordance with the laws of the
          State of Florida. Any disputes arising under this Agreement shall be resolved through
          binding arbitration in Palm Beach County, Florida, in accordance with the rules of
          the American Arbitration Association. The prevailing party shall be entitled to recover
          reasonable attorney&rsquo;s fees and costs.
        </p>

        <h3>11. Miscellaneous</h3>
        <ol className="list-[lower-alpha] pl-6">
          <li>
            <strong>Entire Agreement:</strong> This Agreement constitutes the entire agreement
            between the parties and supersedes all prior discussions, negotiations, and agreements.
            Modifications must be in writing and signed by both parties.
          </li>
          <li>
            <strong>Severability:</strong> If any provision of this Agreement is found to be
            unenforceable, the remaining provisions shall continue in full force and effect.
          </li>
          <li>
            <strong>Assignment:</strong> The Consignor may not assign this Agreement without the
            prior written consent of the Auction House.
          </li>
          <li>
            <strong>Photography and Reproduction Rights:</strong> The Consignor grants the Auction
            House the right to photograph, illustrate, and reproduce images of the Property for
            catalog, marketing, advertising, and archival purposes.
          </li>
        </ol>

        <div className="border-t border-border mt-12 pt-8">
          <h3 className="!mt-0">Signatures</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6">
            <div>
              <p className="font-semibold mb-4">Consignor:</p>
              <div className="space-y-4">
                <div className="border-b border-foreground/20 pb-1">
                  <p className="text-xs text-muted-foreground">Full Legal Name</p>
                </div>
                <div className="border-b border-foreground/20 pb-1">
                  <p className="text-xs text-muted-foreground">Signature</p>
                </div>
                <div className="border-b border-foreground/20 pb-1">
                  <p className="text-xs text-muted-foreground">Date</p>
                </div>
                <div className="border-b border-foreground/20 pb-1">
                  <p className="text-xs text-muted-foreground">Email Address</p>
                </div>
                <div className="border-b border-foreground/20 pb-1">
                  <p className="text-xs text-muted-foreground">Phone Number</p>
                </div>
                <div className="border-b border-foreground/20 pb-1">
                  <p className="text-xs text-muted-foreground">Mailing Address</p>
                </div>
              </div>
            </div>

            <div>
              <p className="font-semibold mb-4">Auction House:</p>
              <div className="space-y-4">
                <div className="border-b border-foreground/20 pb-1">
                  <p className="text-sm">{BUSINESS.name}</p>
                </div>
                <div className="border-b border-foreground/20 pb-1">
                  <p className="text-xs text-muted-foreground">Authorized Signature</p>
                </div>
                <div className="border-b border-foreground/20 pb-1">
                  <p className="text-xs text-muted-foreground">Date</p>
                </div>
              </div>
              <div className="mt-6 text-sm text-muted-foreground">
                <p>{BUSINESS.email}</p>
                <p>{BUSINESS.phone}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-border mt-8 pt-6">
          <h3 className="!mt-0">Inventory Schedule</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Attach a detailed list of consigned items including descriptions, quantities,
            agreed estimates, and reserve prices (if applicable).
          </p>
          <div className="border border-dashed border-foreground/20 rounded-lg p-8 text-center text-sm text-muted-foreground">
            [Itemized inventory to be attached]
          </div>
        </div>
      </div>
    </div>
  );
}
