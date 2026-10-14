/**
 * The consignor's private signing link. Keyed by the prospect's
 * agreementToken, never its id: the id is in the consignor's photo paths,
 * which end up in public lot image URLs.
 */
export function agreementUrlForToken(token: string): string {
  return `${process.env.NEXT_PUBLIC_APP_URL || 'https://mayells.com'}/consignment-agreement?token=${encodeURIComponent(token)}`;
}
