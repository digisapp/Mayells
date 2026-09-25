/** Referrer hosts that are one service under several names. */
const KNOWN: Array<[RegExp, string]> = [
  [/(^|\.)google\.[a-z.]+$/, 'Google'],
  [/(^|\.)bing\.com$/, 'Bing'],
  [/(^|\.)duckduckgo\.com$/, 'DuckDuckGo'],
  [/(^|\.)yahoo\.com$/, 'Yahoo'],
  [/(^|\.)facebook\.com$|^fb\.me$/, 'Facebook'],
  [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)linkedin\.com$|^lnkd\.in$/, 'LinkedIn'],
  [/^t\.co$|(^|\.)(twitter|x)\.com$/, 'X (Twitter)'],
  [/(^|\.)pinterest\.[a-z.]+$/, 'Pinterest'],
  [/(^|\.)youtube\.com$/, 'YouTube'],
  [/(^|\.)chatgpt\.com$|(^|\.)openai\.com$/, 'ChatGPT'],
  [/(^|\.)perplexity\.ai$/, 'Perplexity'],
  [/(^|\.)liveauctioneers\.com$/, 'LiveAuctioneers'],
  [/(^|\.)nextdoor\.com$/, 'Nextdoor'],
  [/(^|\.)yelp\.com$/, 'Yelp'],
];

export const DIRECT_SOURCE = 'Direct / typed';

/**
 * A readable name for where a visit came from: the campaign's utm_source
 * when the link was tagged, else the referring site, else direct.
 */
export function sourceLabel(utmSource: string | null, referrerHost: string | null): string {
  if (utmSource) return utmSource;
  if (!referrerHost) return DIRECT_SOURCE;
  const host = referrerHost.toLowerCase().replace(/^(www|m|l|lm)\./, '');
  for (const [pattern, name] of KNOWN) {
    if (pattern.test(host)) return name;
  }
  return host;
}
