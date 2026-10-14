import { describe, it, expect } from 'vitest';
import { isJsonRequest, isSameOriginRequest, rejectCrossSiteAuthRequest } from '../same-origin';

function post(headers: Record<string, string>, url = 'https://mayells.com/api/auth/login') {
  return new Request(url, { method: 'POST', headers });
}

describe('isSameOriginRequest', () => {
  it('accepts a request from the site it was sent to', () => {
    expect(isSameOriginRequest(post({ origin: 'https://mayells.com', host: 'mayells.com' }))).toBe(true);
    expect(
      isSameOriginRequest(post({ origin: 'http://localhost:3000', host: 'localhost:3000' }, 'http://localhost:3000/api/auth/login')),
    ).toBe(true);
  });

  it('goes by X-Forwarded-Host behind a proxy', () => {
    expect(
      isSameOriginRequest(post({ origin: 'https://preview.example.app', host: 'internal:3000', 'x-forwarded-host': 'preview.example.app' })),
    ).toBe(true);
  });

  it('accepts the configured app URL even when Host differs', () => {
    expect(isSameOriginRequest(post({ origin: 'https://mayells.com', host: 'internal:3000' }))).toBe(true);
  });

  it('refuses another site, a lookalike and the opaque "null" origin', () => {
    expect(isSameOriginRequest(post({ origin: 'https://evil.example', host: 'mayells.com' }))).toBe(false);
    expect(isSameOriginRequest(post({ origin: 'https://mayells.com.evil.example', host: 'mayells.com' }))).toBe(false);
    expect(isSameOriginRequest(post({ origin: 'null', host: 'mayells.com' }))).toBe(false);
  });

  it('lets a request with no Origin through', () => {
    expect(isSameOriginRequest(post({ host: 'mayells.com' }))).toBe(true);
  });
});

describe('isJsonRequest', () => {
  it('accepts application/json with or without a charset', () => {
    expect(isJsonRequest(post({ 'content-type': 'application/json' }))).toBe(true);
    expect(isJsonRequest(post({ 'content-type': 'Application/JSON; charset=utf-8' }))).toBe(true);
  });

  it('refuses what a plain HTML form can send', () => {
    expect(isJsonRequest(post({ 'content-type': 'text/plain' }))).toBe(false);
    expect(isJsonRequest(post({ 'content-type': 'application/x-www-form-urlencoded' }))).toBe(false);
    expect(isJsonRequest(post({ 'content-type': 'multipart/form-data; boundary=x' }))).toBe(false);
    expect(isJsonRequest(post({}))).toBe(false);
  });
});

describe('rejectCrossSiteAuthRequest', () => {
  it('passes the site’s own JSON request', () => {
    expect(
      rejectCrossSiteAuthRequest(post({ origin: 'https://mayells.com', host: 'mayells.com', 'content-type': 'application/json' })),
    ).toBeNull();
  });

  it('refuses a cross-site text/plain form post (login CSRF)', () => {
    const res = rejectCrossSiteAuthRequest(post({ origin: 'https://evil.example', host: 'mayells.com', 'content-type': 'text/plain' }));
    expect(res?.status).toBe(403);
  });

  it('refuses a same-site request that is not JSON', () => {
    const res = rejectCrossSiteAuthRequest(post({ origin: 'https://mayells.com', host: 'mayells.com', 'content-type': 'text/plain' }));
    expect(res?.status).toBe(415);
  });

  it('checks only the origin for bodiless posts', () => {
    expect(rejectCrossSiteAuthRequest(post({ origin: 'https://mayells.com', host: 'mayells.com' }), { json: false })).toBeNull();
    expect(
      rejectCrossSiteAuthRequest(post({ origin: 'https://evil.example', host: 'mayells.com' }), { json: false })?.status,
    ).toBe(403);
  });
});
