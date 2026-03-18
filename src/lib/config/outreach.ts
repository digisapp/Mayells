export const statusColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800',
  contacted: 'bg-yellow-100 text-yellow-800',
  follow_up: 'bg-orange-100 text-orange-800',
  interested: 'bg-green-100 text-green-800',
  converted: 'bg-emerald-100 text-emerald-800',
  not_interested: 'bg-gray-100 text-gray-600',
  do_not_contact: 'bg-red-100 text-red-600',
};

export const categoryLabels: Record<string, string> = {
  estate_attorney: 'Estate Attorney',
  trust_estate_planning: 'Trust & Estate',
  elder_law: 'Elder Law',
  wealth_management: 'Wealth Mgmt',
  family_office: 'Family Office',
  cpa_tax: 'CPA / Tax',
  divorce_attorney: 'Divorce Attorney',
  insurance: 'Insurance',
  estate_liquidator: 'Liquidator',
  real_estate: 'Real Estate',
  art_advisor: 'Art Advisor',
  bank_trust: 'Bank Trust',
  other: 'Other',
};

export const categoryOptions = [
  { value: 'estate_attorney', label: 'Estate Attorney' },
  { value: 'trust_estate_planning', label: 'Trust & Estate Planning' },
  { value: 'elder_law', label: 'Elder Law' },
  { value: 'wealth_management', label: 'Wealth Management' },
  { value: 'family_office', label: 'Family Office' },
  { value: 'cpa_tax', label: 'CPA / Tax Specialist' },
  { value: 'divorce_attorney', label: 'Divorce Attorney' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'estate_liquidator', label: 'Estate Liquidator' },
  { value: 'real_estate', label: 'Real Estate (Luxury)' },
  { value: 'art_advisor', label: 'Art Advisor' },
  { value: 'bank_trust', label: 'Bank Trust Department' },
  { value: 'other', label: 'Other' },
];

export const statusOptions = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'interested', label: 'Interested' },
  { value: 'converted', label: 'Converted' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'do_not_contact', label: 'Do Not Contact' },
];

export const EMAIL_TEMPLATES = [
  {
    name: 'Initial Outreach',
    subject: 'Partnership Opportunity with Mayell Auction House',
    body: `Dear {contactName},

I'm reaching out from Mayell, a luxury auction house specializing in art, antiques, jewelry, and fine collectibles.

We frequently work with professionals in your field and would love to explore how we might be a resource for your clients — whether they're looking to sell estate items, get professional appraisals, or find unique pieces.

Would you be open to a brief call to discuss how we might work together?

Best regards,
Mayell Team`,
  },
  {
    name: 'Follow-Up',
    subject: 'Following up — Mayell Partnership',
    body: `Dear {contactName},

I wanted to follow up on my previous message about a potential partnership between your firm and Mayell.

We offer complimentary appraisals and can handle the entire process of selling estate items — from cataloging to marketing to auction. This can be a valuable service for your clients going through estate transitions.

I'd welcome the chance to meet briefly and share more. What does your schedule look like this week?

Best regards,
Mayell Team`,
  },
  {
    name: 'Services Overview',
    subject: 'How Mayell Can Help Your Clients',
    body: `Dear {contactName},

I wanted to share a quick overview of the services Mayell offers that may benefit your clients:

• Free Appraisals — Expert valuations for estate planning, insurance, or sale purposes
• Estate Liquidation — Full-service handling of estate collections
• Auction Consignment — Maximum market exposure for high-value items
• Private Sales — Discreet handling of sensitive transactions

We handle everything from pickup to payment, and our team has decades of experience with luxury goods.

Would you like to schedule a brief meeting to discuss referral opportunities?

Best regards,
Mayell Team`,
  },
];
