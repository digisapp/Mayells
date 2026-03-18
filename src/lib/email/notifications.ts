import { getResend } from './resend';
import { formatCurrency } from '@/types';
import { BUSINESS } from '@/lib/config';

const FROM = 'Mayell <notifications@mayellauctions.com>';
const ADMIN_EMAIL = BUSINESS.email;

function emailLayout(content: string, title?: string): string {
  return `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #272D35;">
        ${title ? `<h1 style="color: #272D35; font-size: 24px;">${title}</h1>` : ''}
        ${content}
        <p style="margin-top: 30px; font-size: 12px; color: #999;">
          Mayell — The Auction House of the Future
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
          Submitted via mayellauctions.com
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
  const resend = getResend();
  await resend.emails.send({
    from: FROM,
    to: params.email,
    subject: `You've been outbid on "${params.lotTitle}"`,
    html: emailLayout(`
        <p>Another bidder has placed a higher bid on <strong>${params.lotTitle}</strong>.</p>
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

export async function sendInvoiceNotification(params: {
  email: string;
  lotTitle: string;
  invoiceNumber: string;
  totalAmount: number;
  dueDate: Date;
}) {
  const resend = getResend();
  await resend.emails.send({
    from: FROM,
    to: params.email,
    subject: `Invoice ${params.invoiceNumber} — Congratulations on your purchase!`,
    html: emailLayout(`
        <p>You've won <strong>${params.lotTitle}</strong>. Your invoice is ready.</p>
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
        ${ctaButton(`${process.env.NEXT_PUBLIC_APP_URL}/invoices`, 'Pay Invoice')}
    `, 'Congratulations!'),
  });
}

export async function sendPaymentConfirmation(params: {
  email: string;
  lotTitle: string;
  invoiceNumber: string;
  totalAmount: number;
}) {
  const resend = getResend();
  await resend.emails.send({
    from: FROM,
    to: params.email,
    subject: `Payment received for ${params.invoiceNumber}`,
    html: emailLayout(`
        <p>Thank you! We've received your payment of <strong>${formatCurrency(params.totalAmount)}</strong> for <strong>${params.lotTitle}</strong>.</p>
        <p>We'll begin preparing your item for shipment. You'll receive tracking information once it ships.</p>
    `, 'Payment Confirmed'),
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
) {
  const resend = getResend();
  const rows = [
    `<tr><td style="padding: 6px 12px; color: #666; vertical-align: top;">Name:</td><td style="padding: 6px 12px; font-weight: bold;">${params.name}</td></tr>`,
    `<tr><td style="padding: 6px 12px; color: #666; vertical-align: top;">Phone:</td><td style="padding: 6px 12px;">${params.phone}</td></tr>`,
    params.email ? `<tr><td style="padding: 6px 12px; color: #666; vertical-align: top;">Email:</td><td style="padding: 6px 12px;">${params.email}</td></tr>` : '',
    params.service ? `<tr><td style="padding: 6px 12px; color: #666; vertical-align: top;">Service:</td><td style="padding: 6px 12px;">${params.service}</td></tr>` : '',
    params.items ? `<tr><td style="padding: 6px 12px; color: #666; vertical-align: top;">Items:</td><td style="padding: 6px 12px;">${params.items}</td></tr>` : '',
    params.message ? `<tr><td style="padding: 6px 12px; color: #666; vertical-align: top;">Message:</td><td style="padding: 6px 12px;">${params.message}</td></tr>` : '',
  ].filter(Boolean).join('');

  const photoSection = photoUrls && photoUrls.length > 0
    ? `
      <h2 style="color: #272D35; font-size: 18px; margin-top: 24px;">Photos (${photoUrls.length})</h2>
      <div style="margin: 12px 0;">
        ${photoUrls.map((url, i) => `<a href="${url}" style="display: inline-block; margin: 4px;"><img src="${url}" alt="Photo ${i + 1}" style="width: 120px; height: 120px; object-fit: cover; border-radius: 4px; border: 1px solid #ddd;" /></a>`).join('')}
      </div>
    `
    : '';

  await resend.emails.send({
    from: FROM,
    to: ADMIN_EMAIL,
    subject: `New Service Request from ${params.name}${photoUrls?.length ? ` (${photoUrls.length} photos)` : ''}`,
    html: adminEmailLayout(`
        <table style="margin: 16px 0; border-collapse: collapse; width: 100%;">${rows}</table>
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
  const resend = getResend();

  // Notify admin
  await resend.emails.send({
    from: FROM,
    to: ADMIN_EMAIL,
    subject: `New Consignment Submission: ${params.title}`,
    html: adminEmailLayout(`
        <table style="margin: 16px 0; border-collapse: collapse; width: 100%;">
          <tr><td style="padding: 6px 12px; color: #666;">From:</td><td style="padding: 6px 12px; font-weight: bold;">${params.sellerName} (${params.sellerEmail})</td></tr>
          <tr><td style="padding: 6px 12px; color: #666;">Item:</td><td style="padding: 6px 12px; font-weight: bold;">${params.title}</td></tr>
          ${params.category ? `<tr><td style="padding: 6px 12px; color: #666;">Category:</td><td style="padding: 6px 12px;">${params.category}</td></tr>` : ''}
          <tr><td style="padding: 6px 12px; color: #666; vertical-align: top;">Description:</td><td style="padding: 6px 12px;">${params.description}</td></tr>
        </table>
        ${ctaButton(`${process.env.NEXT_PUBLIC_APP_URL}/admin/consignments`, 'Review in Admin')}
    `, 'New Consignment Submission'),
  });

  // Confirm to seller
  await resend.emails.send({
    from: FROM,
    to: params.sellerEmail,
    subject: `We've received your consignment: ${params.title}`,
    html: emailLayout(`
        <p>Thank you for submitting <strong>${params.title}</strong> for consignment with Mayell.</p>
        <p>Our team will review your submission and contact you within 1-2 business days to discuss next steps.</p>
        ${ctaButton(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/consignments`, 'Track Your Consignment')}
    `, 'Consignment Received'),
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
  const resend = getResend();
  await resend.emails.send({
    from: FROM,
    to: params.clientEmail,
    subject: `${BUSINESS.name} — Your Estate Appraisal Report`,
    html: `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #272D35;">
        <div style="text-align: center; padding: 30px 0; border-bottom: 2px solid #D4C5A0;">
          <h1 style="font-size: 28px; margin: 0; letter-spacing: 2px;">${BUSINESS.name}</h1>
          <p style="color: #D4C5A0; font-size: 12px; text-transform: uppercase; letter-spacing: 3px; margin-top: 4px;">Estate Appraisal Report</p>
        </div>
        <div style="padding: 30px 0;">
          <p>Dear ${params.clientName},</p>
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
