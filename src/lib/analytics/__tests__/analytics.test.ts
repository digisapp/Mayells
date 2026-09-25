import { describe, expect, it } from 'vitest';
import { normalizePath } from '../paths';
import { sourceLabel, DIRECT_SOURCE } from '../sources';
import { isLeadForm } from '../beacon';
import { siteForHost, externalReferrerHost } from '../record';

describe('normalizePath', () => {
  it('keeps public paths, without query, fragment or trailing slash', () => {
    expect(normalizePath('/')).toBe('/');
    expect(normalizePath('/auctions/')).toBe('/auctions');
    expect(normalizePath('/lots/abc?utm_source=x#photos')).toBe('/lots/abc');
    expect(normalizePath('//consign')).toBe('/consign');
  });

  it('never stores a secret token', () => {
    expect(normalizePath('/upload/9f8e7d6c5b4a')).toBe('/upload/[token]');
    expect(normalizePath('/upload/9f8e7d6c5b4a/done')).toBe('/upload/[token]');
    expect(normalizePath('/invoices/tok_123')).toBe('/invoices/[token]');
    expect(normalizePath('/appraisal-report/abc')).toBe('/appraisal-report/[token]');
    expect(normalizePath('/consignor/abc')).toBe('/consignor/[token]');
    expect(normalizePath('/reset-password?code=secret')).toBe('/reset-password');
  });

  it('keeps the signed-in invoices list, which has no token', () => {
    expect(normalizePath('/invoices')).toBe('/invoices');
  });

  it('drops staff pages, APIs and anything malformed', () => {
    expect(normalizePath('/admin')).toBeNull();
    expect(normalizePath('/admin/analytics')).toBeNull();
    expect(normalizePath('/api/pv')).toBeNull();
    expect(normalizePath('/sites/jupiter')).toBeNull();
    expect(normalizePath('https://evil.example/')).toBeNull();
    expect(normalizePath('')).toBeNull();
  });

  it('does not mistake a public page for a staff one', () => {
    expect(normalizePath('/administration-of-estates')).toBe('/administration-of-estates');
  });
});

describe('sourceLabel', () => {
  it('prefers the campaign tag', () => {
    expect(sourceLabel('newsletter', 'google.com')).toBe('newsletter');
  });

  it('names the big referrers however they are spelled', () => {
    expect(sourceLabel(null, 'google.com')).toBe('Google');
    expect(sourceLabel(null, 'www.google.co.uk')).toBe('Google');
    expect(sourceLabel(null, 'l.facebook.com')).toBe('Facebook');
    expect(sourceLabel(null, 'm.facebook.com')).toBe('Facebook');
    expect(sourceLabel(null, 't.co')).toBe('X (Twitter)');
    expect(sourceLabel(null, 'chatgpt.com')).toBe('ChatGPT');
  });

  it('shows other sites by host and no referrer as direct', () => {
    expect(sourceLabel(null, 'palmbeachdailynews.com')).toBe('palmbeachdailynews.com');
    expect(sourceLabel(null, null)).toBe(DIRECT_SOURCE);
  });

  it('does not match look-alike hosts', () => {
    expect(sourceLabel(null, 'notgoogle.com')).toBe('notgoogle.com');
  });
});

function fakeForm(selectors: string[]) {
  return {
    querySelector: (query: string) => (query.split(',').some((q) => selectors.includes(q.trim())) ? ({} as Element) : null),
  };
}

describe('isLeadForm', () => {
  const tel = 'input[type="tel"]';
  const email = 'input[type="email"]';
  const textarea = 'textarea';
  const file = 'input[type="file"]';
  const password = 'input[type="password"]';

  it('matches appraisal and consignment forms', () => {
    expect(isLeadForm(fakeForm([tel, email, textarea, file]))).toBe(true);
    expect(isLeadForm(fakeForm([tel, textarea]))).toBe(true);
    expect(isLeadForm(fakeForm([email, file]))).toBe(true);
  });

  it('leaves out newsletter, sign-in and chat', () => {
    expect(isLeadForm(fakeForm([email]))).toBe(false);
    expect(isLeadForm(fakeForm([email, password]))).toBe(false);
    expect(isLeadForm(fakeForm([email, textarea, password]))).toBe(false);
    expect(isLeadForm(fakeForm([textarea, file]))).toBe(false);
  });
});

describe('siteForHost', () => {
  it('maps the main domain and the city domains, with or without www', () => {
    expect(siteForHost('mayells.com')).toBe('mayells');
    expect(siteForHost('www.mayells.com')).toBe('mayells');
    expect(siteForHost('jupiterauctions.com')).toBe('jupiter');
    expect(siteForHost('www.delraybeachauctions.com')).toBe('delray-beach');
  });

  it('ignores local, preview and unknown hosts', () => {
    expect(siteForHost('localhost:3000')).toBeNull();
    expect(siteForHost('mayells-git-main-digis.vercel.app')).toBeNull();
    expect(siteForHost('mayells.com.evil.example')).toBeNull();
    expect(siteForHost(null)).toBeNull();
  });
});

describe('externalReferrerHost', () => {
  it('keeps other sites and drops the site itself', () => {
    expect(externalReferrerHost('https://www.google.com/', 'mayells.com')).toBe('google.com');
    expect(externalReferrerHost('https://mayells.com/auctions', 'mayells.com')).toBeNull();
    expect(externalReferrerHost('https://www.mayells.com/', 'mayells.com')).toBeNull();
    expect(externalReferrerHost('https://mayells.com/', 'jupiterauctions.com')).toBe('mayells.com');
    expect(externalReferrerHost('not a url', 'mayells.com')).toBeNull();
    expect(externalReferrerHost(undefined, 'mayells.com')).toBeNull();
  });
});
