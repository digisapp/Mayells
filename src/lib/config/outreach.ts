/**
 * Outreach (referral-partner CRM) vocab shared by the API routes, the list
 * table, and both forms. One label map per enum — the table and the forms
 * used to carry their own copies with different wording.
 */

export const OUTREACH_CATEGORIES = [
  'estate_attorney',
  'trust_estate_planning',
  'elder_law',
  'wealth_management',
  'family_office',
  'cpa_tax',
  'divorce_attorney',
  'insurance',
  'estate_liquidator',
  'real_estate',
  'art_advisor',
  'bank_trust',
  'other',
] as const;
export type OutreachCategory = (typeof OUTREACH_CATEGORIES)[number];

export const OUTREACH_STATUSES = [
  'new',
  'contacted',
  'follow_up',
  'interested',
  'converted',
  'not_interested',
  'do_not_contact',
] as const;
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];

/** Statuses that must never be emailed and never show as "due". */
export const OUTREACH_CLOSED_STATUSES: readonly OutreachStatus[] = ['converted', 'not_interested', 'do_not_contact'];
export const OUTREACH_NO_EMAIL_STATUSES: readonly OutreachStatus[] = ['do_not_contact', 'not_interested'];

export const statusColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800',
  contacted: 'bg-yellow-100 text-yellow-800',
  follow_up: 'bg-orange-100 text-orange-800',
  interested: 'bg-green-100 text-green-800',
  converted: 'bg-emerald-100 text-emerald-800',
  not_interested: 'bg-gray-100 text-gray-600',
  do_not_contact: 'bg-red-100 text-red-600',
};

export const categoryLabels: Record<OutreachCategory, string> = {
  estate_attorney: 'Estate Attorney',
  trust_estate_planning: 'Trust & Estate Planning',
  elder_law: 'Elder Law',
  wealth_management: 'Wealth Management',
  family_office: 'Family Office',
  cpa_tax: 'CPA / Tax',
  divorce_attorney: 'Divorce Attorney',
  insurance: 'Insurance',
  estate_liquidator: 'Estate Liquidator',
  real_estate: 'Real Estate',
  art_advisor: 'Art Advisor',
  bank_trust: 'Bank Trust',
  other: 'Other',
};

export const statusLabels: Record<OutreachStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  follow_up: 'Follow Up',
  interested: 'Interested',
  converted: 'Converted',
  not_interested: 'Not Interested',
  do_not_contact: 'Do Not Contact',
};

export const categoryOptions = OUTREACH_CATEGORIES.map((value) => ({ value, label: categoryLabels[value] }));
export const statusOptions = OUTREACH_STATUSES.map((value) => ({ value, label: statusLabels[value] }));

/** Resolve a free-text category (CSV import) to an enum value, else 'other'. */
export function parseOutreachCategory(raw: string | null | undefined): OutreachCategory {
  if (!raw) return 'other';
  const norm = raw.trim().toLowerCase().replace(/[\s/&-]+/g, '_');
  const direct = OUTREACH_CATEGORIES.find((c) => c === norm);
  if (direct) return direct;
  const byLabel = OUTREACH_CATEGORIES.find((c) => categoryLabels[c].toLowerCase() === raw.trim().toLowerCase());
  if (byLabel) return byLabel;
  // loose contains match on the label ("attorney" → estate_attorney is too
  // ambiguous, so only match when the label is contained in the input)
  const loose = OUTREACH_CATEGORIES.find((c) => raw.toLowerCase().includes(categoryLabels[c].toLowerCase()));
  return loose ?? 'other';
}

export const EMAIL_TEMPLATES = [
  {
    name: 'Initial Outreach',
    subject: 'Partnership Opportunity with Mayells Auction House',
    body: `Dear {contactName},

I'm reaching out from Mayells, a luxury auction house specializing in art, antiques, jewelry, and fine collectibles.

We frequently work with professionals in your field and would love to explore how we might be a resource for your clients — whether they're looking to sell estate items, get professional appraisals, or find unique pieces.

Would you be open to a brief call to discuss how we might work together?

Best regards,
Mayells Team`,
  },
  {
    name: 'Follow-Up',
    subject: 'Following up — Mayells Partnership',
    body: `Dear {contactName},

I wanted to follow up on my previous message about a potential partnership between your firm and Mayells.

We offer complimentary appraisals and can handle the entire process of selling estate items — from cataloging to marketing to auction. This can be a valuable service for your clients going through estate transitions.

I'd welcome the chance to meet briefly and share more. What does your schedule look like this week?

Best regards,
Mayells Team`,
  },
  {
    name: 'Services Overview',
    subject: 'How Mayells Can Help Your Clients',
    body: `Dear {contactName},

I wanted to share a quick overview of the services Mayells offers that may benefit your clients:

• Free Appraisals — Expert valuations for estate planning, insurance, or sale purposes
• Estate Liquidation — Full-service handling of estate collections
• Auction Consignment — Maximum market exposure for high-value items
• Private Sales — Discreet handling of sensitive transactions

We handle everything from pickup to payment, and our team has decades of experience with luxury goods.

Would you like to schedule a brief meeting to discuss referral opportunities?

Best regards,
Mayells Team`,
  },
];

/**
 * Fill the personalisation placeholders. A missing contact name falls back to
 * "Dear Colleague" for the salutation and "there" elsewhere.
 */
export function personalizeTemplate(
  text: string,
  contact: { contactName?: string | null; companyName: string },
): string {
  const name = contact.contactName?.trim();
  return text
    .replace(/Dear\s+\{contactName\}/g, name ? `Dear ${name}` : 'Dear Colleague')
    .replace(/\{contactName\}/g, name || 'there')
    .replace(/\{companyName\}/g, contact.companyName);
}
