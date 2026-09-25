import { describe, it, expect } from 'vitest';
import { parseUploadState, restoredCounts, snapshotUploadState } from '../persist';

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

const tasks = [
  { id: '1', status: 'complete', resultUrl: 'https://s.supabase.co/a.jpg', isVideo: false },
  { id: '2', status: 'complete', resultUrl: 'https://s.supabase.co/b.mov', isVideo: true },
  { id: '3', status: 'uploading', isVideo: false },
  { id: '4', status: 'error', isVideo: false },
  { id: '5', status: 'complete', resultUrl: 'https://s.supabase.co/c.jpg', isVideo: false },
];

describe('snapshotUploadState', () => {
  it('keeps finished uploads, their grouping and notes, and counts the unfinished', () => {
    const snap = snapshotUploadState(
      [
        { taskIds: ['1', '2', '3'], notes: 'Chair' },
        { taskIds: ['4'], notes: 'lost' },
        { taskIds: ['5'], notes: '' },
        { taskIds: [], notes: '' },
      ],
      tasks,
      NOW,
    );
    expect(snap).toEqual({
      v: 1,
      savedAt: NOW,
      items: [
        {
          notes: 'Chair',
          media: [
            { url: 'https://s.supabase.co/a.jpg', video: false },
            { url: 'https://s.supabase.co/b.mov', video: true },
          ],
          unfinished: 1,
        },
        { notes: 'lost', media: [], unfinished: 1 },
        { notes: '', media: [{ url: 'https://s.supabase.co/c.jpg', video: false }], unfinished: 0 },
      ],
    });
    expect(restoredCounts(snap!)).toEqual({ photos: 2, videos: 1, unfinished: 2 });
  });

  it('is null when nothing has finished uploading', () => {
    expect(snapshotUploadState([{ taskIds: ['3', '4'], notes: 'x' }], tasks, NOW)).toBeNull();
    expect(snapshotUploadState([{ taskIds: [], notes: '' }], [], NOW)).toBeNull();
  });
});

describe('parseUploadState', () => {
  const good = snapshotUploadState([{ taskIds: ['1'], notes: 'Vase' }], tasks, NOW)!;

  it('round-trips a saved state', () => {
    expect(parseUploadState(JSON.stringify(good), NOW + DAY)).toEqual(good);
  });

  it('expires after a week', () => {
    expect(parseUploadState(JSON.stringify(good), NOW + 8 * DAY)).toBeNull();
  });

  it('ignores missing, corrupt or foreign data', () => {
    expect(parseUploadState(null, NOW)).toBeNull();
    expect(parseUploadState('{not json', NOW)).toBeNull();
    expect(parseUploadState(JSON.stringify({ ...good, v: 2 }), NOW)).toBeNull();
    expect(parseUploadState(JSON.stringify({ ...good, items: 'x' }), NOW)).toBeNull();
    expect(parseUploadState(JSON.stringify({ ...good, items: [{ media: [] }] }), NOW)).toBeNull();
  });

  it('drops media that are not https URLs', () => {
    const tampered = {
      ...good,
      items: [{ notes: '', unfinished: 0, media: [{ url: 'javascript:alert(1)', video: false }, good.items[0].media[0]] }],
    };
    expect(parseUploadState(JSON.stringify(tampered), NOW)?.items[0].media).toEqual(good.items[0].media);
  });
});
