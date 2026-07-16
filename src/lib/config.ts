// Centralized business configuration
export const BUSINESS = {
  name: 'Mayells',
  tagline: 'Fine Art Antiques Design Fashion Collectibles',
  phone: '(561) 220-4622',
  phoneHref: 'tel:+15612204622',
  email: 'info@mayells.com',
  servicesEmail: 'services@mayells.com',
  // Everyone who should receive admin notifications (new appraisal requests,
  // consignments, inquiries). info@ lands in the built-in /admin/emails inbox
  // once Resend inbound routing is enabled; nathan@ is a monitored mailbox.
  notifyEmails: ['info@mayells.com', 'nathan@examodels.com'],
  // Every non-spam inbound email is also forwarded here, so the owner has a
  // copy in a real mailbox that survives platform outages. Must be OUTSIDE
  // the domains whose MX points at the platform, or forwards would loop.
  forwardInboundTo: 'nathan@examodels.com',
  url: 'https://mayells.com',
} as const;
