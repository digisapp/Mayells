import { getResend } from './resend';
import { formatCurrency } from '@/types';
import { BUSINESS } from '@/lib/config';

const FROM = 'Mayells <notifications@mayells.com>';
const ADMIN_EMAIL = BUSINESS.email;

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
    html: `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #272D35; font-size: 24px;">You've Been Outbid</h1>
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
        <a href="${params.lotUrl}" style="display: inline-block; background: #D4C5A0; color: #272D35; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 4px;">
          Place a New Bid
        </a>
        <p style="margin-top: 30px; font-size: 12px; color: #999;">
          Mayells — The Auction House of the Future
        </p>
      </div>
    `,
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
    html: `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #272D35; font-size: 24px;">Congratulations!</h1>
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
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/invoices" style="display: inline-block; background: #D4C5A0; color: #272D35; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 4px;">
          Pay Invoice
        </a>
        <p style="margin-top: 30px; font-size: 12px; color: #999;">
          Mayells — The Auction House of the Future
        </p>
      </div>
    `,
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
    html: `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #272D35; font-size: 24px;">Payment Confirmed</h1>
        <p>Thank you! We've received your payment of <strong>${formatCurrency(params.totalAmount)}</strong> for <strong>${params.lotTitle}</strong>.</p>
        <p>We'll begin preparing your item for shipment. You'll receive tracking information once it ships.</p>
        <p style="margin-top: 30px; font-size: 12px; color: #999;">
          Mayells — The Auction House of the Future
        </p>
      </div>
    `,
  });
}

export async function sendAppraisalRequestNotification(params: {
  name: string;
  phone: string;
  email?: string;
  service?: string;
  items?: string;
  message?: string;
}) {
  const resend = getResend();
  const rows = [
    `<tr><td style="padding: 6px 12px; color: #666; vertical-align: top;">Name:</td><td style="padding: 6px 12px; font-weight: bold;">${params.name}</td></tr>`,
    `<tr><td style="padding: 6px 12px; color: #666; vertical-align: top;">Phone:</td><td style="padding: 6px 12px;">${params.phone}</td></tr>`,
    params.email ? `<tr><td style="padding: 6px 12px; color: #666; vertical-align: top;">Email:</td><td style="padding: 6px 12px;">${params.email}</td></tr>` : '',
    params.service ? `<tr><td style="padding: 6px 12px; color: #666; vertical-align: top;">Service:</td><td style="padding: 6px 12px;">${params.service}</td></tr>` : '',
    params.items ? `<tr><td style="padding: 6px 12px; color: #666; vertical-align: top;">Items:</td><td style="padding: 6px 12px;">${params.items}</td></tr>` : '',
    params.message ? `<tr><td style="padding: 6px 12px; color: #666; vertical-align: top;">Message:</td><td style="padding: 6px 12px;">${params.message}</td></tr>` : '',
  ].filter(Boolean).join('');

  await resend.emails.send({
    from: FROM,
    to: ADMIN_EMAIL,
    subject: `New Service Request from ${params.name}`,
    html: `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #272D35; font-size: 24px;">New Service / Appraisal Request</h1>
        <table style="margin: 16px 0; border-collapse: collapse; width: 100%;">${rows}</table>
        <p style="margin-top: 30px; font-size: 12px; color: #999;">
          Submitted via mayells.com
        </p>
      </div>
    `,
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
    html: `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #272D35; font-size: 24px;">New Consignment Submission</h1>
        <table style="margin: 16px 0; border-collapse: collapse; width: 100%;">
          <tr><td style="padding: 6px 12px; color: #666;">From:</td><td style="padding: 6px 12px; font-weight: bold;">${params.sellerName} (${params.sellerEmail})</td></tr>
          <tr><td style="padding: 6px 12px; color: #666;">Item:</td><td style="padding: 6px 12px; font-weight: bold;">${params.title}</td></tr>
          ${params.category ? `<tr><td style="padding: 6px 12px; color: #666;">Category:</td><td style="padding: 6px 12px;">${params.category}</td></tr>` : ''}
          <tr><td style="padding: 6px 12px; color: #666; vertical-align: top;">Description:</td><td style="padding: 6px 12px;">${params.description}</td></tr>
        </table>
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/admin/consignments" style="display: inline-block; background: #D4C5A0; color: #272D35; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 4px;">
          Review in Admin
        </a>
        <p style="margin-top: 30px; font-size: 12px; color: #999;">Submitted via mayells.com</p>
      </div>
    `,
  });

  // Confirm to seller
  await resend.emails.send({
    from: FROM,
    to: params.sellerEmail,
    subject: `We've received your consignment: ${params.title}`,
    html: `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #272D35; font-size: 24px;">Consignment Received</h1>
        <p>Thank you for submitting <strong>${params.title}</strong> for consignment with Mayells.</p>
        <p>Our team will review your submission and contact you within 1-2 business days to discuss next steps.</p>
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/consignments" style="display: inline-block; background: #D4C5A0; color: #272D35; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 4px;">
          Track Your Consignment
        </a>
        <p style="margin-top: 30px; font-size: 12px; color: #999;">
          Mayells — The Auction House of the Future
        </p>
      </div>
    `,
  });
}
