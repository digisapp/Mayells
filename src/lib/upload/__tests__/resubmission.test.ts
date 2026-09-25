import { describe, it, expect } from 'vitest';
import {
  chatPhotoHash,
  chatPhotoPath,
  parseSubmissionId,
  planResubmission,
  planUploadItems,
  resubmissionKey,
  submissionMarker,
  unattachedChatPhotos,
  type OriginalLead,
} from '../resubmission';

const BASE = 'https://x.supabase.co/storage/v1/object/public/lot-images/';
const url = (name: string) => `${BASE}uploads/p1/${name}.jpg`;
const pathOf = (u: string) => (u.startsWith(BASE) ? u.slice(BASE.length).split('?')[0] : null);

describe('planUploadItems', () => {
  const stored = [
    { id: 'item-1', images: [url('a'), url('b')], sellerNotes: 'Vase' },
    { id: 'item-2', images: [url('c')], sellerNotes: null },
  ];

  it('inserts everything on a first send', () => {
    const plan = planUploadItems([{ images: [url('a')] }, { images: [url('b')], sellerNotes: 'x' }], [], pathOf);
    expect(plan.insert).toEqual([{ images: [url('a')] }, { images: [url('b')], sellerNotes: 'x' }]);
    expect(plan.update).toEqual([]);
    expect(plan.alreadyStored).toBe(0);
  });

  it('adds nothing when the whole send is a resend', () => {
    const plan = planUploadItems(
      [{ images: [url('a'), url('b')], sellerNotes: 'Vase' }, { images: [url('c')] }],
      stored,
      pathOf,
    );
    expect(plan).toEqual({ insert: [], update: [], alreadyStored: 2 });
  });

  it('inserts only the new items of a resend that has more', () => {
    const plan = planUploadItems([{ images: [url('a'), url('b')] }, { images: [url('d')] }], stored, pathOf);
    expect(plan.insert).toEqual([{ images: [url('d')] }]);
    expect(plan.alreadyStored).toBe(1);
  });

  it('adds a photo taken after a failed send to the stored item, not a new one', () => {
    const plan = planUploadItems([{ images: [url('a'), url('b'), url('e')], sellerNotes: 'Vase' }], stored, pathOf);
    expect(plan.insert).toEqual([]);
    expect(plan.update).toEqual([{ id: 'item-1', images: [url('a'), url('b'), url('e')], added: [url('e')] }]);
  });

  it('keeps notes the seller rewrote before resending', () => {
    const plan = planUploadItems([{ images: [url('c')], sellerNotes: '  Signed on the base ' }], stored, pathOf);
    expect(plan.update).toEqual([{ id: 'item-2', images: [url('c')], added: [], sellerNotes: 'Signed on the base' }]);
  });

  it('matches photos by storage path, not by the exact URL', () => {
    const plan = planUploadItems([{ images: [`${url('c')}?t=123`] }], stored, pathOf);
    expect(plan.alreadyStored).toBe(1);
    expect(plan.insert).toEqual([]);
  });

  it('never stores one photo twice within a send', () => {
    const plan = planUploadItems([{ images: [url('x'), url('x')] }, { images: [url('x')] }], [], pathOf);
    expect(plan.insert).toEqual([{ images: [url('x')] }]);
  });
});

describe('lead form resends', () => {
  const id = '3F2A6C1E-8B4D-4A9E-9C7B-1D2E3F4A5B6C';

  it('accepts only a well-formed form id', () => {
    expect(parseSubmissionId(id)).toBe(id.toLowerCase());
    expect(parseSubmissionId('not-an-id')).toBeNull();
    expect(parseSubmissionId(`${id}%`)).toBeNull();
    expect(parseSubmissionId(42)).toBeNull();
    expect(parseSubmissionId(undefined)).toBeNull();
  });

  it('marks the prospect with the form id', () => {
    expect(submissionMarker('abc')).toBe('Form ref: abc');
  });

  it('locks on the form id, else the first photo, else nothing', () => {
    expect(resubmissionKey('abc', ['z', 'y'])).toBe('form:abc');
    expect(resubmissionKey(null, ['z', 'y'])).toBe('photo:y');
    expect(resubmissionKey(null, [])).toBeNull();
  });

  const original: OriginalLead = {
    fullName: 'Jane Doe',
    phone: '(561) 555-0100',
    email: 'jane@example.com',
    itemSummary: 'A Tiffany lamp',
    attachedUrls: ['u1', 'u2'],
  };
  const at = new Date('2026-09-25T12:00:00Z');
  const form = { name: 'Jane Doe', phone: '561-555-0100', email: 'Jane@Example.com', items: 'A Tiffany lamp' };

  it('treats a plain repeat as nothing new', () => {
    expect(planResubmission(original, form, ['u1', 'u2'], at)).toEqual({ addPhotos: [], note: null });
    // The same lead from a form that doesn't ask for email.
    expect(planResubmission(original, { ...form, email: '' }, [], at).note).toBeNull();
  });

  it('adds photos that made it this time, once each', () => {
    const plan = planResubmission(original, form, ['u1', 'u3', 'u3'], at);
    expect(plan.addPhotos).toEqual(['u3']);
    expect(plan.note).toBe('[2026-09-25T12:00:00.000Z] Sent again from the website form with 1 more photo.');
  });

  it('notes details the seller changed instead of losing them', () => {
    const plan = planResubmission(original, { ...form, phone: '561-555-0199', items: 'A Tiffany lamp and a clock' }, [], at);
    expect(plan.addPhotos).toEqual([]);
    expect(plan.note).toBe(
      '[2026-09-25T12:00:00.000Z] Sent again from the website form. Changed:\nPhone: 561-555-0199\nItems: A Tiffany lamp and a clock',
    );
  });
});

describe('chat photos', () => {
  const hash = 'ab'.repeat(32);

  it('stores the content hash in the name and reads it back', () => {
    const path = chatPhotoPath(hash, 'n0nce123', 'jpg');
    expect(path).toBe(`submissions/chat-${'ab'.repeat(16)}-n0nce123.jpg`);
    expect(chatPhotoHash(`${BASE}${path}`)).toBe('ab'.repeat(16));
    expect(chatPhotoHash(`${BASE}submissions/1700000000000-abc.jpg`)).toBeNull();
  });

  it('skips photos the prospect already has, and repeats within a call', () => {
    const attached = [`${BASE}${chatPhotoPath(hash, 'first', 'jpg')}`, `${BASE}uploads/p1/other.jpg`];
    const other = 'cd'.repeat(32);
    const photos = [{ hash, n: 1 }, { hash: other, n: 2 }, { hash: other, n: 3 }];
    expect(unattachedChatPhotos(photos, attached)).toEqual([{ hash: other, n: 2 }]);
    expect(unattachedChatPhotos(photos, [])).toEqual([{ hash, n: 1 }, { hash: other, n: 2 }]);
  });
});
