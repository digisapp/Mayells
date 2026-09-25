import { describe, it, expect, vi, afterEach } from 'vitest';
import { missingPhotosHeadline, newSubmissionId, withMissingPhotosNote } from '../use-photo-attachments';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => vi.unstubAllGlobals());

describe('newSubmissionId', () => {
  it('is a fresh UUID each fill', () => {
    const a = newSubmissionId();
    expect(a).toMatch(UUID);
    expect(newSubmissionId()).not.toBe(a);
  });

  it('still makes one where randomUUID is missing (plain-http previews)', () => {
    vi.stubGlobal('crypto', {});
    expect(newSubmissionId()).toMatch(UUID);
  });
});

describe('missing-photo wording', () => {
  it('says which share of the photos the specialist has', () => {
    const result = { paths: ['a', 'b', 'c'], failed: 2, total: 5 };
    expect(withMissingPhotosNote('A lamp', result)).toBe(
      'A lamp\n\n[2 of 5 photo(s) did not upload — please ask the seller to resend them.]',
    );
    expect(missingPhotosHeadline(result)).toBe("2 of your 5 photos didn't come through.");
  });

  it('says when photos were still uploading as the deadline passed', () => {
    const result = { paths: ['a'], failed: 2, total: 3, timedOut: true };
    expect(withMissingPhotosNote('', result)).toBe(
      '[2 of 3 photo(s) did not upload in time (slow connection) — please ask the seller to resend them.]',
    );
    expect(missingPhotosHeadline(result)).toBe("2 of your 3 photos didn't finish uploading.");
    expect(missingPhotosHeadline({ paths: [], failed: 1, total: 1, timedOut: true })).toBe(
      "Your photo didn't finish uploading.",
    );
  });

  it('adds nothing when every photo arrived', () => {
    expect(withMissingPhotosNote('A lamp', { paths: ['a'], failed: 0, total: 1 })).toBe('A lamp');
  });
});
