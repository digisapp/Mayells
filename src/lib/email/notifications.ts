import { getResend } from './resend';
import { escapeHtml } from './escape';
import { formatCurrency } from '@/types';
import { BUSINESS } from '@/lib/config';
import { db } from '@/db';
import { emails } from '@/db/schema';
import { logger } from '@/lib/logger';

const FROM = 'Mayells <notifications@mayells.com>';
const FROM_EMAIL = 'notifications@mayells.com';
const ADMIN_EMAIL = [...BUSINESS.notifyEmails];

async function sendAndLog(params: { to: string | string[]; subject: string; html: string }) {
  const resend = getResend();
  const toLabel = Array.isArray(params.to) ? params.to.join(', ') : params.to;
  // The Resend SDK returns { data, error } and never throws
  const { data: sent, error } = await resend.emails.send({
    from: FROM,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });

  if (error) {
    logger.error('Failed to send email via Resend', undefined, {
      to: toLabel,
      subject: params.subject,
      error: error.message,
    });
    // 'bounced' is the schema's outbound-failure status
    await db.insert(emails).values({
      resendId: null,
      direction: 'outbound',
      fromEmail: FROM_EMAIL,
      fromName: 'Mayells',
      toEmail: toLabel,
      subject: params.subject,
      bodyHtml: params.html,
      status: 'bounced',
    });
    throw new Error(`Failed to send email to ${toLabel}: ${error.message}`);
  }

  await db.insert(emails).values({
    resendId: sent?.id || null,
    direction: 'outbound',
    fromEmail: FROM_EMAIL,
    fromName: 'Mayells',
    toEmail: toLabel,
    subject: params.subject,
    bodyHtml: params.html,
    status: 'sent',
  });
}

function emailLayout(content: string, title?: string): string {
  return `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #272D35;">
        ${title ? `<h1 style="color: #272D35; font-size: 24px;">${title}</h1>` : ''}
        ${content}
        <p style="margin-top: 30px; font-size: 12px; color: #999;">
          Mayells — The Auction House of the Future
        </p>
      </div>
    `;
}

function adminEmailLayout(content: string, title?: string): string {
  return `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #272D35;">
        ${title ? `<h1 style="color: #272D35; font-size: 24px;">${title}</h1>` : ''}
        ${content}
        <p style="margin-top: 30px; font-size: 12px; color: #999;">
          Submitted via mayells.com
        </p>
      </div>
    `;
}

function ctaButton(href: string, label: string): string {
  return `<a href="${href}" style="display: inline-block; background: #D4C5A0; color: #272D35; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 4px;">${label}</a>`;
}

export async function sendOutbidNotification(params: {
  email: string;
  lotTitle: string;
  lotUrl: string;
  currentBid: number;
  yourBid: number;
}) {
  await sendAndLog({
    to: params.email,
    subject: `You've been outbid on "${params.lotTitle}"`,
    html: emailLayout(`
        <p>Another bidder has placed a higher bid on <strong>${escapeHtml(params.lotTitle)}</strong>.</p>
        <table style="margin: 20px 0; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 16px; color: #666;">Your bid:</td>
            <td style="padding: 8px 16px; font-weight: bold;">${formatCurrency(params.yourBid)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 16px; color: #666;">Current bid:</td>
            <td style="padding: 8px 16px; font-weight: bold; color: #c33;">${formatCurrency(params.currentBid)}</td>
          </tr>
        </table>
        ${ctaButton(params.lotUrl, 'Place a New Bid')}
    `, "You've Been Outbid"),
  });
}

export async function sendEndingSoonNotification(params: {
  email: string;
  lotTitle: string;
  lotUrl: string;
  currentBid: number;
  hasBids: boolean;
  closingAt: Date;
}) {
  const closesLabel = params.closingAt.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  await sendAndLog({
    to: params.email,
    subject: `Ending soon: "${params.lotTitle}"`,
    html: emailLayout(`
        <p>A lot on your watchlist is closing soon.</p>
        <p style="font-size: 18px; font-weight: bold; margin: 16px 0 4px;">${escapeHtml(params.lotTitle)}</p>
        <table style="margin: 12px 0 20px; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 16px; color: #666;">${params.hasBids ? 'Current bid:' : 'Status:'}</td>
            <td style="padding: 8px 16px; font-weight: bold;">${params.hasBids ? formatCurrency(params.currentBid) : 'No bids yet — be the first'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 16px; color: #666;">Closes:</td>
            <td style="padding: 8px 16px; font-weight: bold; color: #c33;">${closesLabel}</td>
          </tr>
        </table>
        ${ctaButton(params.lotUrl, 'Place Your Bid')}
        <p style="margin-top: 20px; font-size: 12px; color: #999;">You're receiving this because you added this lot to your watchlist.</p>
    `, 'Ending Soon'),
  });
}

/**
 * Forward a copy of an inbound email to the owner's external mailbox.
 * Deliberately NOT routed through sendAndLog: the original message is already
 * stored in the emails table, and logging the forward too would double every
 * inbound thread in the admin inbox. Reply-To is set to the original sender
 * so replying from the external mailbox goes straight to the customer.
 */
export async function forwardInboundEmail(params: {
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  subject: string;
  bodyHtml: string | null;
  bodyText: string | null;
}) {
  const resend = getResend();
  const senderLabel = params.fromName
    ? `${params.fromName} <${params.fromEmail}>`
    : params.fromEmail;

  const originalBody =
    params.bodyHtml ??
    (params.bodyText
      ? `<pre style="font-family: inherit; white-space: pre-wrap;">${escapeHtml(params.bodyText)}</pre>`
      : '<p style="color: #999;">(no message body)</p>');

  const { error } = await resend.emails.send({
    from: FROM,
    to: BUSINESS.forwardInboundTo,
    replyTo: params.fromEmail,
    subject: `Fwd: ${params.subject}`,
    html: `
      <div style="font-size: 12px; color: #666; border-bottom: 1px solid #ddd; padding-bottom: 8px; margin-bottom: 12px;">
        Forwarded from the Mayells inbox — reply goes directly to the sender.<br />
        <strong>From:</strong> ${escapeHtml(senderLabel)}<br />
        <strong>To:</strong> ${escapeHtml(params.toEmail)}
      </div>
      ${originalBody}
    `,
  });
  if (error) {
    throw new Error(`Failed to forward inbound email: ${error.message}`);
  }
}

export async function sendSavedSearchAlert(params: {
  email: string;
  searchLabel: string;
  searchUrl: string;
  baseUrl: string;
  lots: Array<{
    title: string;
    url: string;
    imageUrl: string | null;
    estimateLow: number | null;
    estimateHigh: number | null;
    buyNowPrice: number | null;
  }>;
}) {
  const lotRows = params.lots
    .map((lot) => {
      const price = lot.buyNowPrice
        ? `Buy now: ${formatCurrency(lot.buyNowPrice)}`
        : lot.estimateLow && lot.estimateHigh
          ? `Est. ${formatCurrency(lot.estimateLow)} – ${formatCurrency(lot.estimateHigh)}`
          : '';
      return `
        <tr>
          ${lot.imageUrl ? `<td style="padding: 10px 12px 10px 0; width: 84px;"><a href="${lot.url}"><img src="${lot.imageUrl}" alt="" style="width: 72px; height: 72px; object-fit: cover; border-radius: 6px; border: 1px solid #eee;" /></a></td>` : '<td style="padding: 10px 12px 10px 0; width: 84px;"></td>'}
          <td style="padding: 10px 0;">
            <a href="${lot.url}" style="color: #272D35; font-weight: bold; text-decoration: none;">${escapeHtml(lot.title)}</a>
            ${price ? `<div style="color: #666; font-size: 13px; margin-top: 4px;">${price}</div>` : ''}
          </td>
        </tr>`;
    })
    .join('');

  await sendAndLog({
    to: params.email,
    subject: `New arrivals for "${params.searchLabel}"`,
    html: emailLayout(`
        <p>New items matching a search you follow just arrived at Mayells.</p>
        <p style="font-size: 16px; font-weight: bold; margin: 16px 0 8px;">&ldquo;${escapeHtml(params.searchLabel)}&rdquo;</p>
        <table style="margin: 8px 0 20px; border-collapse: collapse; width: 100%;">${lotRows}</table>
        ${ctaButton(params.searchUrl, 'View All Matches')}
        <p style="margin-top: 20px; font-size: 12px; color: #999;">
          You follow this search on Mayells. <a href="${params.baseUrl}/watchlist" style="color: #999;">Manage followed searches</a>.
        </p>
    `, 'New Arrivals'),
  });
}

export async function sendInvoiceNotification(params: {
  email: string;
  lotTitle: string;
  invoiceNumber: string;
  totalAmount: number;
  dueDate: Date;
  accessToken: string;
}) {
  await sendAndLog({
    to: params.email,
    subject: `Invoice ${params.invoiceNumber} — Congratulations on your purchase!`,
    html: emailLayout(`
        <p>You've won <strong>${escapeHtml(params.lotTitle)}</strong>. Your invoice is ready.</p>
        <table style="margin: 20px 0; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 16px; color: #666;">Invoice:</td>
            <td style="padding: 8px 16px; font-weight: bold;">${params.invoiceNumber}</td>
          </tr>
          <tr>
            <td style="padding: 8px 16px; color: #666;">Total:</td>
            <td style="padding: 8px 16px; font-weight: bold; font-size: 20px;">${formatCurrency(params.totalAmount)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 16px; color: #666;">Due by:</td>
            <td style="padding: 8px 16px;">${params.dueDate.toLocaleDateString()}</td>
          </tr>
        </table>
        ${ctaButton(`${process.env.NEXT_PUBLIC_APP_URL}/invoices/${params.accessToken}`, 'View & Pay Invoice')}
    `, 'Congratulations!'),
  });
}

export async function sendPaymentConfirmation(params: {
  email: string;
  lotTitle: string;
  invoiceNumber: string;
  totalAmount: number;
}) {
  await sendAndLog({
    to: params.email,
    subject: `Payment received for ${params.invoiceNumber}`,
    html: emailLayout(`
        <p>Thank you! We've received your payment of <strong>${formatCurrency(params.totalAmount)}</strong> for <strong>${escapeHtml(params.lotTitle)}</strong>.</p>
        <p>We'll begin preparing your item for shipment. You'll receive tracking information once it ships.</p>
    `, 'Payment Confirmed'),
  });
}

export async function sendSellerStatementNotification(params: {
  email: string;
  sellerName: string;
  lotTitle: string;
  hammerPrice: number;
  commissionPercent: number;
  commissionAmount: number;
  netAmount: number;
}) {
  await sendAndLog({
    to: params.email,
    subject: `Your item sold — settlement statement for "${params.lotTitle}"`,
    html: emailLayout(`
        <p>Dear ${escapeHtml(params.sellerName)},</p>
        <p>Great news — <strong>${escapeHtml(params.lotTitle)}</strong> has sold and the buyer's payment has been received. Here is your settlement statement:</p>
        <table style="margin: 20px 0; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 16px; color: #666;">Hammer price:</td>
            <td style="padding: 8px 16px; font-weight: bold;">${formatCurrency(params.hammerPrice)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 16px; color: #666;">Seller's commission (${params.commissionPercent}%):</td>
            <td style="padding: 8px 16px;">−${formatCurrency(params.commissionAmount)}</td>
          </tr>
          <tr style="border-top: 1px solid #ddd;">
            <td style="padding: 8px 16px; color: #666;">Net proceeds to you:</td>
            <td style="padding: 8px 16px; font-weight: bold; font-size: 20px;">${formatCurrency(params.netAmount)}</td>
          </tr>
        </table>
        <p>Your proceeds will be remitted per your consignment agreement. If your payment details or mailing address have changed, please reply to this email.</p>
    `, 'Your Item Has Sold'),
  });
}

export async function sendAppraisalRequestNotification(
  params: {
    name: string;
    phone: string;
    email?: string;
    service?: string;
    items?: string;
    message?: string;
  },
  photoUrls?: string[],
  aiEstimate?: {
    estimateLow: number;
    estimateHigh: number;
    confidence: string;
    summary: string;
    worthConsigning: boolean;
  } | null,
) {
  const rows = [
    `<tr><td style="padding: 6px 12px; color: #666; vertical-align: top;">Name:</td><td style="padding: 6px 12px; font-weight: bold;">${escapeHtml(params.name)}</td></tr>`,
    `<tr><td style="padding: 6px 12px; color: #666; vertical-align: top;">Phone:</td><td style="padding: 6px 12px;">${escapeHtml(params.phone)}</td></tr>`,
    params.email ? `<tr><td style="padding: 6px 12px; color: #666; vertical-align: top;">Email:</td><td style="padding: 6px 12px;">${escapeHtml(params.email)}</td></tr>` : '',
    params.service ? `<tr><td style="padding: 6px 12px; color: #666; vertical-align: top;">Service:</td><td style="padding: 6px 12px;">${escapeHtml(params.service)}</td></tr>` : '',
    params.items ? `<tr><td style="padding: 6px 12px; color: #666; vertical-align: top;">Items:</td><td style="padding: 6px 12px;">${escapeHtml(params.items)}</td></tr>` : '',
    params.message ? `<tr><td style="padding: 6px 12px; color: #666; vertical-align: top;">Message:</td><td style="padding: 6px 12px;">${escapeHtml(params.message)}</td></tr>` : '',
  ].filter(Boolean).join('');

  const photoSection = photoUrls && photoUrls.length > 0
    ? `
      <h2 style="color: #272D35; font-size: 18px; margin-top: 24px;">Photos (${photoUrls.length})</h2>
      <div style="margin: 12px 0;">
        ${photoUrls.map((url, i) => `<a href="${url}" style="display: inline-block; margin: 4px;"><img src="${url}" alt="Photo ${i + 1}" style="width: 120px; height: 120px; object-fit: cover; border-radius: 4px; border: 1px solid #ddd;" /></a>`).join('')}
      </div>
    `
    : '';

  const estimateSection = aiEstimate
    ? `
      <h2 style="color: #272D35; font-size: 18px; margin-top: 24px;">AI Preliminary Estimate</h2>
      <table style="margin: 12px 0; border-collapse: collapse;">
        <tr><td style="padding: 6px 12px; color: #666;">Range:</td><td style="padding: 6px 12px; font-weight: bold;">${formatCurrency(aiEstimate.estimateLow)} – ${formatCurrency(aiEstimate.estimateHigh)}</td></tr>
        <tr><td style="padding: 6px 12px; color: #666;">Confidence:</td><td style="padding: 6px 12px;">${escapeHtml(aiEstimate.confidence)}</td></tr>
        <tr><td style="padding: 6px 12px; color: #666;">Fit:</td><td style="padding: 6px 12px;">${aiEstimate.worthConsigning ? 'Looks consignable' : 'Possibly below threshold'}</td></tr>
        <tr><td style="padding: 6px 12px; color: #666; vertical-align: top;">Summary:</td><td style="padding: 6px 12px;">${escapeHtml(aiEstimate.summary)}</td></tr>
      </table>
      <p style="font-size: 12px; color: #999;">This range was already shown to the prospect on mayells.com.</p>
    `
    : '';

  await sendAndLog({
    to: ADMIN_EMAIL,
    subject: `New Service Request from ${params.name}${photoUrls?.length ? ` (${photoUrls.length} photos)` : ''}${aiEstimate ? ` — AI est. ${formatCurrency(aiEstimate.estimateLow)}–${formatCurrency(aiEstimate.estimateHigh)}` : ''}`,
    html: adminEmailLayout(`
        <table style="margin: 16px 0; border-collapse: collapse; width: 100%;">${rows}</table>
        ${estimateSection}
        ${photoSection}
    `, 'New Service / Appraisal Request'),
  });
}

export async function sendConsignmentNotification(params: {
  sellerName: string;
  sellerEmail: string;
  title: string;
  description: string;
  category?: string;
}) {
  // Notify admin
  await sendAndLog({
    to: ADMIN_EMAIL,
    subject: `New Consignment Submission: ${params.title}`,
    html: adminEmailLayout(`
        <table style="margin: 16px 0; border-collapse: collapse; width: 100%;">
          <tr><td style="padding: 6px 12px; color: #666;">From:</td><td style="padding: 6px 12px; font-weight: bold;">${escapeHtml(params.sellerName)} (${escapeHtml(params.sellerEmail)})</td></tr>
          <tr><td style="padding: 6px 12px; color: #666;">Item:</td><td style="padding: 6px 12px; font-weight: bold;">${escapeHtml(params.title)}</td></tr>
          ${params.category ? `<tr><td style="padding: 6px 12px; color: #666;">Category:</td><td style="padding: 6px 12px;">${escapeHtml(params.category)}</td></tr>` : ''}
          <tr><td style="padding: 6px 12px; color: #666; vertical-align: top;">Description:</td><td style="padding: 6px 12px;">${escapeHtml(params.description)}</td></tr>
        </table>
        ${ctaButton(`${process.env.NEXT_PUBLIC_APP_URL}/admin/consignments`, 'Review in Admin')}
    `, 'New Consignment Submission'),
  });

  // Confirm to seller
  await sendAndLog({
    to: params.sellerEmail,
    subject: `We've received your consignment: ${params.title}`,
    html: emailLayout(`
        <p>Thank you for submitting <strong>${escapeHtml(params.title)}</strong> for consignment with Mayells.</p>
        <p>Our team will review your submission and contact you within 1-2 business days to discuss next steps.</p>
        ${ctaButton(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/consignments`, 'Track Your Consignment')}
    `, 'Consignment Received'),
  });
}

/**
 * Notify seller that their item sold and needs to be shipped.
 * Includes shipping options: drop off at FedEx/UPS, schedule pickup, or white glove.
 */
export async function sendSellerShippingNotification(params: {
  sellerEmail: string;
  sellerName: string;
  lotTitle: string;
  hammerPrice: number;
  commission: number;
  sellerPayout: number;
  labelUrl?: string | null;
  shipmentId: string;
  isWhiteGlove?: boolean;
}) {
  const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/shipments`;

  const shippingInstructions = params.isWhiteGlove
    ? `
      <p>Due to the value and nature of this item, we've arranged <strong>white glove shipping</strong>. A professional art shipper will contact you to schedule pickup at your convenience.</p>
      <p>Please ensure the item is accessible and in the condition described in the listing.</p>
    `
    : `
      <p>Please ship this item within <strong>3 business days</strong>. You have two options:</p>
      <div style="margin: 20px 0;">
        <div style="background: #f9f8f5; border: 1px solid #e5e2d9; border-radius: 8px; padding: 20px; margin-bottom: 12px;">
          <strong>Option A: Drop Off</strong>
          <p style="margin: 8px 0 0; color: #666;">Print your prepaid shipping label and drop the package at any FedEx or UPS location.</p>
          ${params.labelUrl ? ctaButton(params.labelUrl, 'Download Shipping Label') : '<p style="color: #c33;">Label will be available shortly in your dashboard.</p>'}
        </div>
        <div style="background: #f9f8f5; border: 1px solid #e5e2d9; border-radius: 8px; padding: 20px;">
          <strong>Option B: Schedule Pickup</strong>
          <p style="margin: 8px 0 0; color: #666;">Request a carrier to pick up the package from your address.</p>
          ${ctaButton(dashboardUrl, 'Schedule Pickup')}
        </div>
      </div>
      <p style="font-size: 13px; color: #666;">Pack the item securely. Once shipped, damage in transit is between the buyer and the carrier.</p>
    `;

  await sendAndLog({
    to: params.sellerEmail,
    subject: `Your item sold! Ship "${params.lotTitle}"`,
    html: emailLayout(`
      <p>Congratulations, ${escapeHtml(params.sellerName)}! Your item has sold.</p>
      <table style="margin: 20px 0; border-collapse: collapse; width: 100%;">
        <tr>
          <td style="padding: 8px 16px; color: #666;">Item:</td>
          <td style="padding: 8px 16px; font-weight: bold;">${escapeHtml(params.lotTitle)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 16px; color: #666;">Hammer Price:</td>
          <td style="padding: 8px 16px; font-weight: bold;">${formatCurrency(params.hammerPrice)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 16px; color: #666;">Commission:</td>
          <td style="padding: 8px 16px;">${formatCurrency(params.commission)}</td>
        </tr>
        <tr style="border-top: 2px solid #D4C5A0;">
          <td style="padding: 8px 16px; color: #666; font-weight: bold;">Your Payout:</td>
          <td style="padding: 8px 16px; font-weight: bold; font-size: 20px; color: #2a7a2a;">${formatCurrency(params.sellerPayout)}</td>
        </tr>
      </table>
      <h2 style="font-size: 18px; margin-top: 30px;">Shipping Instructions</h2>
      ${shippingInstructions}
    `, 'Your Item Sold!'),
  });
}

/**
 * Notify buyer that their item has shipped with tracking info.
 */
export async function sendBuyerShippingNotification(params: {
  buyerEmail: string;
  buyerName: string;
  lotTitle: string;
  trackingNumber: string;
  trackingUrl?: string | null;
  carrier: string;
  estimatedDelivery?: string | null;
}) {
  await sendAndLog({
    to: params.buyerEmail,
    subject: `Your item "${params.lotTitle}" has shipped!`,
    html: emailLayout(`
      <p>Great news! Your item is on its way.</p>
      <table style="margin: 20px 0; border-collapse: collapse; width: 100%;">
        <tr>
          <td style="padding: 8px 16px; color: #666;">Item:</td>
          <td style="padding: 8px 16px; font-weight: bold;">${escapeHtml(params.lotTitle)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 16px; color: #666;">Carrier:</td>
          <td style="padding: 8px 16px;">${escapeHtml(params.carrier.toUpperCase())}</td>
        </tr>
        <tr>
          <td style="padding: 8px 16px; color: #666;">Tracking:</td>
          <td style="padding: 8px 16px; font-weight: bold;">${escapeHtml(params.trackingNumber)}</td>
        </tr>
        ${params.estimatedDelivery ? `
        <tr>
          <td style="padding: 8px 16px; color: #666;">Est. Delivery:</td>
          <td style="padding: 8px 16px;">${params.estimatedDelivery}</td>
        </tr>` : ''}
      </table>
      ${params.trackingUrl ? ctaButton(params.trackingUrl, 'Track Your Package') : ''}
      <p style="margin-top: 20px; font-size: 13px; color: #666;">If your item arrives damaged, please contact the carrier directly to file a claim. All shipments are insured.</p>
    `, 'Your Item Has Shipped'),
  });
}

/**
 * Send a private upload link to a seller prospect.
 */
export async function sendUploadLinkNotification(params: {
  prospectEmail: string;
  prospectName: string;
  uploadUrl: string;
  message?: string;
}) {
  await sendAndLog({
    to: params.prospectEmail,
    subject: `${BUSINESS.name} — Upload Your Items for Consignment`,
    html: emailLayout(`
      <p>Dear ${escapeHtml(params.prospectName)},</p>
      <p>Thank you for your interest in consigning with ${BUSINESS.name}. We've prepared a secure link for you to upload photos of your items.</p>
      ${params.message ? `<p style="background: #f9f8f5; border-left: 3px solid #D4C5A0; padding: 12px 16px; color: #555;">${escapeHtml(params.message)}</p>` : ''}
      <p>Simply click the button below and add photos of each item you'd like us to review. You can also include a brief description or any known history for each piece.</p>
      <div style="text-align: center; margin: 30px 0;">
        ${ctaButton(params.uploadUrl, 'Upload Your Items')}
      </div>
      <p style="font-size: 13px; color: #666;">Tips for best results:</p>
      <ul style="font-size: 13px; color: #666;">
        <li>Photograph each item from multiple angles</li>
        <li>Include close-ups of any signatures, marks, or labels</li>
        <li>Capture any damage or wear</li>
        <li>Use natural lighting when possible</li>
      </ul>
      <p>Our team will review your items and follow up within 1-2 business days.</p>
      <p style="margin-top: 30px;">Warm regards,<br /><strong>The ${BUSINESS.name} Team</strong><br /><span style="color: #888; font-size: 13px;">${BUSINESS.phone} &bull; ${BUSINESS.email}</span></p>
    `, 'Upload Your Items'),
  });
}

/**
 * Notify admin when a seller has uploaded items via their private link.
 */
export async function sendItemsReceivedNotification(params: {
  prospectName: string;
  prospectEmail?: string;
  itemCount: number;
  prospectId: string;
}) {
  await sendAndLog({
    to: ADMIN_EMAIL,
    subject: `${params.prospectName} uploaded ${params.itemCount} items for review`,
    html: adminEmailLayout(`
      <table style="margin: 16px 0; border-collapse: collapse; width: 100%;">
        <tr><td style="padding: 6px 12px; color: #666;">Seller:</td><td style="padding: 6px 12px; font-weight: bold;">${escapeHtml(params.prospectName)}${params.prospectEmail ? ` (${escapeHtml(params.prospectEmail)})` : ''}</td></tr>
        <tr><td style="padding: 6px 12px; color: #666;">Items Uploaded:</td><td style="padding: 6px 12px; font-weight: bold;">${params.itemCount}</td></tr>
      </table>
      ${ctaButton(`${process.env.NEXT_PUBLIC_APP_URL}/admin/prospects/${params.prospectId}`, 'Review Items')}
    `, 'New Items Uploaded'),
  });
}

/**
 * Notify prospect that their items have been reviewed and accepted.
 */
export async function sendProspectAcceptedNotification(params: {
  prospectEmail: string;
  prospectName: string;
  acceptedCount: number;
  totalEstimateLow: number;
  totalEstimateHigh: number;
}) {
  await sendAndLog({
    to: params.prospectEmail,
    subject: `${BUSINESS.name} — Your Items Have Been Accepted`,
    html: emailLayout(`
      <p>Dear ${escapeHtml(params.prospectName)},</p>
      <p>Great news! After careful review, we are pleased to accept <strong>${params.acceptedCount} item${params.acceptedCount !== 1 ? 's' : ''}</strong> for consignment.</p>
      <table style="margin: 20px 0; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 16px; color: #666;">Items Accepted:</td>
          <td style="padding: 8px 16px; font-weight: bold;">${params.acceptedCount}</td>
        </tr>
        <tr>
          <td style="padding: 8px 16px; color: #666;">Estimated Value:</td>
          <td style="padding: 8px 16px; font-weight: bold;">${formatCurrency(params.totalEstimateLow)} — ${formatCurrency(params.totalEstimateHigh)}</td>
        </tr>
      </table>
      <p>We will be sending you a consignment agreement shortly. Once signed, your items will be cataloged and placed into an upcoming auction.</p>
      <p style="margin-top: 30px;">Warm regards,<br /><strong>The ${BUSINESS.name} Team</strong><br /><span style="color: #888; font-size: 13px;">${BUSINESS.phone} &bull; ${BUSINESS.email}</span></p>
    `, 'Items Accepted for Consignment'),
  });
}

/**
 * Send a follow-up email to a prospect who hasn't responded.
 * Used by the cron job to nudge prospects who submitted via consign form.
 */
export async function sendProspectFollowUpEmail(params: {
  prospectEmail: string;
  prospectName: string;
  uploadUrl?: string;
}) {
  await sendAndLog({
    to: params.prospectEmail,
    subject: `${BUSINESS.name} — We'd Love to Help You`,
    html: emailLayout(`
      <p>Dear ${escapeHtml(params.prospectName)},</p>
      <p>We wanted to follow up and let you know that our team is here to help whenever you're ready. Whether you have questions about the consignment process or need assistance getting started, we're just a phone call or email away.</p>
      ${params.uploadUrl ? `
      <p>If you'd like to share photos of your items, you can use the secure link below — it only takes a few minutes:</p>
      <div style="text-align: center; margin: 30px 0;">
        ${ctaButton(params.uploadUrl, 'Upload Your Items')}
      </div>
      ` : ''}
      <p>Feel free to reach out directly anytime:</p>
      <table style="margin: 16px 0; border-collapse: collapse;">
        <tr>
          <td style="padding: 6px 12px; color: #666;">Phone:</td>
          <td style="padding: 6px 12px; font-weight: bold;">${BUSINESS.phone}</td>
        </tr>
        <tr>
          <td style="padding: 6px 12px; color: #666;">Email:</td>
          <td style="padding: 6px 12px; font-weight: bold;">${BUSINESS.email}</td>
        </tr>
      </table>
      <p>We look forward to working with you.</p>
      <p style="margin-top: 30px;">Warm regards,<br /><strong>The ${BUSINESS.name} Team</strong><br /><span style="color: #888; font-size: 13px;">${BUSINESS.phone} &bull; ${BUSINESS.email}</span></p>
    `, "We're Here to Help"),
  });
}

export async function sendAppraisalReportEmail(params: {
  clientName: string;
  clientEmail: string;
  reportUrl: string;
  itemCount: number;
  totalEstimateLow: number;
  totalEstimateHigh: number;
}) {
  await sendAndLog({
    to: params.clientEmail,
    subject: `${BUSINESS.name} — Your Estate Appraisal Report`,
    html: `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #272D35;">
        <div style="text-align: center; padding: 30px 0; border-bottom: 2px solid #D4C5A0;">
          <h1 style="font-size: 28px; margin: 0; letter-spacing: 2px;">${BUSINESS.name}</h1>
          <p style="color: #D4C5A0; font-size: 12px; text-transform: uppercase; letter-spacing: 3px; margin-top: 4px;">Estate Appraisal Report</p>
        </div>
        <div style="padding: 30px 0;">
          <p>Dear ${escapeHtml(params.clientName)},</p>
          <p>Thank you for allowing ${BUSINESS.name} to appraise your collection. We are pleased to present your comprehensive appraisal report.</p>
          <table style="margin: 20px 0; border-collapse: collapse; width: 100%;">
            <tr>
              <td style="padding: 8px 16px; color: #666;">Items Appraised:</td>
              <td style="padding: 8px 16px; font-weight: bold;">${params.itemCount}</td>
            </tr>
            <tr>
              <td style="padding: 8px 16px; color: #666;">Estimated Total Value:</td>
              <td style="padding: 8px 16px; font-weight: bold; font-size: 18px;">${formatCurrency(params.totalEstimateLow)} — ${formatCurrency(params.totalEstimateHigh)}</td>
            </tr>
          </table>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${params.reportUrl}" style="display: inline-block; background-color: #D4C5A0; color: #272D35; padding: 14px 32px; text-decoration: none; font-weight: bold; font-size: 14px; letter-spacing: 1px; border-radius: 6px;">VIEW YOUR APPRAISAL REPORT</a>
          </div>
          <p>If you are interested in consigning any of these items for auction or private sale, please review our consignment agreement:</p>
          <div style="text-align: center; margin: 20px 0;">
            <a href="${BUSINESS.url}/consignment-agreement" style="display: inline-block; border: 2px solid #D4C5A0; color: #272D35; padding: 12px 28px; text-decoration: none; font-weight: bold; font-size: 13px; border-radius: 6px;">REVIEW CONSIGNMENT AGREEMENT</a>
          </div>
          <p>If you have any questions, please don't hesitate to contact us.</p>
          <p style="margin-top: 30px;">Warm regards,<br /><strong>The ${BUSINESS.name} Team</strong><br /><span style="color: #888; font-size: 13px;">${BUSINESS.phone} &bull; ${BUSINESS.email}</span></p>
        </div>
        <div style="border-top: 1px solid #eee; padding-top: 20px; text-align: center; font-size: 11px; color: #aaa;">
          <p>${BUSINESS.name} &bull; Palm Beach County, Florida</p>
        </div>
      </div>
    `,
  });
}

