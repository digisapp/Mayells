# Gallery Buy Now: setup and how it works

Gallery pieces can be bought online at their fixed price. This page covers what has to be set up before the first sale, and what staff see and do afterwards.

## Before the first online sale

1. **Apply migration 0030** (`drizzle/0030_gallery_checkout.sql`) to the production database before deploying the code. Many queries select whole lot and invoice rows, so the new columns must already exist:

   ```sh
   DATABASE_URL="$(grep '^DATABASE_URL=' .env.local | cut -d= -f2-)" npx drizzle-kit migrate
   ```

2. **Add the Stripe keys** to Vercel production: `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` and `STRIPE_WEBHOOK_SECRET`. Until `STRIPE_SECRET_KEY` is set, every gallery page offers "Inquire to Purchase" instead of Buy Now.

3. **Add the webhook endpoint** `https://mayells.com/api/stripe/webhook` in the Stripe dashboard, subscribed to these events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
   - `charge.dispute.created`
   - `charge.dispute.closed`
   - `checkout.session.completed`
   - `checkout.session.expired` (new; releases an unpaid Buy Now hold straight away; without it the 5-minute cron releases it)
   - `identity.verification_session.verified`

   Without `STRIPE_WEBHOOK_SECRET`, Stripe takes the money but the order is never recorded. The admin lot page warns about this.

4. **Activate Stripe Tax** (Stripe dashboard → Tax): set the origin address (Palm Beach) and add a registration for every state where Mayells must collect sales tax, starting with Florida. Until Stripe Tax is active, Stripe refuses to open the checkout and the buyer sees "Online checkout isn't available right now". To sell without collecting tax, set `STRIPE_TAX=off` (only on advice from your accountant).

5. **Optional:** turn on Apple Pay and Google Pay in Stripe's payment-method settings. They appear on the card checkout by themselves.

## Switching a piece on

On the admin lot page, for a **Gallery (Buy Now)** piece:

- Set the **Buy Now price** and the **US shipping charge** (insured delivery to a US address; `0` means complimentary).
- Tick **Buyers can purchase this piece online**. Only do this for a real piece that is in hand, ready to ship, at its final price. Placeholder pieces must stay off.
- The **Gallery sale** card shows whether Buy Now is live and, if not, why (Stripe not connected, webhook secret missing, Stripe Tax not active, or the piece not listed).

Pieces that don't sell at auction still drop into the gallery automatically at their reserve or low estimate. Online checkout stays off for them until staff set the shipping charge and switch it on.

## What the buyer sees

- **Buy Now.** Buyers who aren't signed in sign in or create an account first and come back to the same piece. Starting checkout **reserves the piece for 32 minutes** while they pay on Stripe's page (card, US address, sales tax worked out from that address).
- Anyone else looking at the piece meanwhile sees **On hold** and the time it becomes available again. The gallery grid shows **Reserved**.
- After paying, the buyer lands on the order page and gets a confirmation email. Staff get a "Gallery sale" email at the addresses in `BUSINESS.notifyEmails`.
- If they abandon checkout, the hold lapses and the piece goes back on sale by itself.

## After a sale

- **Shipment:** a shipment record is created to the checkout address, just like a won auction lot. Pack, ship and record the tracking number as usual.
- **Consignor payout:** a payout is recorded on the price alone (not shipping or tax). The Payouts page marks gallery payouts with the guarantee window. **Wait until 7 days after delivery before paying the consignor.**
- **As-described claims:** if a buyer reports, within 7 days of delivery, that a piece arrived damaged or materially different from its description, agree the return, then refund the invoice in full from Invoices. If the item has already been delivered, the piece is held as "unsold" until it comes back. Relist it after inspection.

## Selling through a specialist

On a listed gallery or private-sale piece, **Invoice a client** (admin lot page) emails the client an invoice to pay by card or wire. The piece shows as Reserved until the invoice is paid (then it is sold) or cancelled (then it is back on sale). Work out the sales tax by hand for these invoices: delivery or collection in Florida is taxable unless the client has a resale certificate on file.

## Where the rules live

- `src/lib/gallery/`: purchase states, the checkout, holds, totals and settlement.
- `GALLERY_CHECKOUT` in `src/lib/gallery/config.ts`: hold length, the guarantee window, ship-to countries and Stripe tax codes. These numbers are quoted in the Terms (`/terms`, sections 2.15–2.16); change the two together.
