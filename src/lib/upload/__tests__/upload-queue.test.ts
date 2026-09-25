import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  COMPRESS_TIMEOUT_MS,
  MAX_CONCURRENT,
  MAX_RETRIES,
  TimeoutError,
  buildSubmission,
  canRetry,
  decideRetry,
  describeFailure,
  failureFromResponse,
  pickNext,
  planPrepareTimeout,
  sendLabel,
  summarizeUploads,
  withTimeout,
  withVisibleTimeout,
} from '../upload-queue';
import { PREP_TIMEOUT_MS } from '../compress-image';
import {
  MAX_IMAGE_BYTES,
  MAX_MEDIA_PER_ITEM,
  MAX_VIDEO_BYTES,
  checkUploadFile,
  suggestedClipSeconds,
  tooLargeMessage,
  uploadContentType,
} from '../limits';

const MB = 1024 * 1024;
const photo = { bytes: 2 * MB, isVideo: false };

describe('checkUploadFile', () => {
  it('accepts photos and videos under their caps', () => {
    expect(checkUploadFile({ name: 'a.jpg', type: 'image/jpeg', size: MAX_IMAGE_BYTES })).toEqual({
      ok: true,
      contentType: 'image/jpeg',
    });
    expect(checkUploadFile({ name: 'a.mov', type: 'video/quicktime', size: MAX_VIDEO_BYTES }).ok).toBe(true);
  });

  it('rejects files over the cap for their kind', () => {
    expect(checkUploadFile({ name: 'a.mov', type: 'video/quicktime', size: 41 * MB })).toEqual({
      ok: false,
      reason: 'too-large',
      bytes: 41 * MB,
      isVideo: true,
    });
    // 20 MB is fine for a video but not a photo.
    expect(checkUploadFile({ name: 'a.mp4', type: 'video/mp4', size: 20 * MB }).ok).toBe(true);
    expect(checkUploadFile({ name: 'a.jpg', type: 'image/jpeg', size: 20 * MB })).toMatchObject({ reason: 'too-large' });
  });

  it('rejects types the server does not take', () => {
    expect(checkUploadFile({ name: 'a.gif', type: 'image/gif', size: 1000 })).toEqual({ ok: false, reason: 'unsupported' });
    expect(checkUploadFile({ name: 'a.dng', type: '', size: 1000 })).toEqual({ ok: false, reason: 'unsupported' });
  });

  it('infers a missing type from the extension', () => {
    expect(uploadContentType({ name: 'IMG_1.HEIC', type: '' })).toBe('image/heic');
    expect(uploadContentType({ name: 'IMG_1.MOV', type: '' })).toBe('video/quicktime');
    expect(checkUploadFile({ name: 'IMG_1.MOV', type: '', size: 1000 })).toEqual({ ok: true, contentType: 'video/quicktime' });
  });
});

describe('size messages', () => {
  it('tells the seller the size, the limit and what to do', () => {
    expect(tooLargeMessage({ bytes: 41 * MB, isVideo: true })).toBe(
      'This video is 41 MB; the limit is 25 MB. Record or trim a shorter clip (about 20 seconds), or email it to info@mayells.com.',
    );
    expect(tooLargeMessage({ bytes: 16.2 * MB, isVideo: false })).toMatch(/^This photo is 17 MB; the limit is 15 MB\./);
  });

  it('uses the real duration to suggest a clip length', () => {
    // 60 MB over 30 s = 2 MB/s, so ~11 s fits: round down to 10.
    expect(suggestedClipSeconds(60 * MB, 30)).toBe(10);
    // Unknown duration: assume ~1 MB/s.
    expect(suggestedClipSeconds(41 * MB)).toBe(20);
    // Never suggest less than 5 seconds.
    expect(suggestedClipSeconds(500 * MB, 60)).toBe(5);
  });
});

describe('failureFromResponse', () => {
  it('does not treat client errors as retryable', () => {
    const f = failureFromResponse('signed-url', 400, 'This video is 41 MB; the limit is 25 MB.', photo);
    expect(f).toEqual({ kind: 'rejected', message: 'This video is 41 MB; the limit is 25 MB.' });
    expect(decideRetry(f, 0, true)).toEqual({ action: 'give-up' });
    expect(decideRetry(failureFromResponse('signed-url', 410, 'expired', photo), 0, true).action).toBe('give-up');
    expect(decideRetry(failureFromResponse('signed-url', 429, 'Too many', photo), 0, true).action).toBe('give-up');
  });

  it('retries server errors and dropped connections', () => {
    expect(failureFromResponse('signed-url', 503, undefined, photo)).toEqual({ kind: 'server' });
    expect(failureFromResponse('storage', 0, undefined, photo)).toEqual({ kind: 'network' });
    expect(failureFromResponse('storage', 408, undefined, photo)).toEqual({ kind: 'network' });
  });

  it('maps storage size rejections to a size failure', () => {
    expect(failureFromResponse('storage', 413, undefined, { bytes: 30 * MB, isVideo: true })).toEqual({
      kind: 'too-large',
      bytes: 30 * MB,
      isVideo: true,
    });
    expect(
      failureFromResponse('storage', 400, 'The object exceeded the maximum allowed size', { bytes: 30 * MB, isVideo: true }),
    ).toMatchObject({ kind: 'too-large' });
  });

  it('retries a stale signed URL, since the next attempt gets a fresh one', () => {
    expect(failureFromResponse('storage', 403, 'signature verification failed', photo)).toEqual({ kind: 'server' });
  });
});

describe('decideRetry', () => {
  it('backs off exponentially, up to MAX_RETRIES attempts', () => {
    expect(decideRetry({ kind: 'network' }, 0, true)).toEqual({ action: 'retry', delayMs: 2000 });
    expect(decideRetry({ kind: 'server' }, 1, true)).toEqual({ action: 'retry', delayMs: 4000 });
    expect(decideRetry({ kind: 'server' }, MAX_RETRIES - 1, true)).toEqual({ action: 'give-up' });
  });

  it('waits for the network instead of burning attempts while offline', () => {
    expect(decideRetry({ kind: 'network' }, 0, false)).toEqual({ action: 'wait-for-network' });
    expect(decideRetry({ kind: 'network' }, 99, false)).toEqual({ action: 'wait-for-network' });
  });

  it('never retries size or type problems', () => {
    expect(decideRetry({ kind: 'too-large', bytes: 1, isVideo: true }, 0, true).action).toBe('give-up');
    expect(decideRetry({ kind: 'unsupported' }, 0, true).action).toBe('give-up');
    expect(canRetry({ kind: 'too-large', bytes: 1, isVideo: true })).toBe(false);
    expect(canRetry({ kind: 'unsupported' })).toBe(false);
    expect(canRetry({ kind: 'rejected' })).toBe(true);
    expect(canRetry(undefined)).toBe(false);
  });
});

describe('describeFailure', () => {
  it('uses the server message for rejections, with a fallback', () => {
    expect(describeFailure({ kind: 'rejected', message: 'This upload link has expired' })).toBe('This upload link has expired');
    expect(describeFailure({ kind: 'rejected' })).toMatch(/info@mayells\.com/);
  });

  it('reads differently offline and online', () => {
    expect(describeFailure({ kind: 'network' }, { online: false })).toMatch(/^Waiting for a connection/);
    expect(describeFailure({ kind: 'network' }, { online: true })).toMatch(/Tap “Try again”/);
  });

  it('passes the video duration through to the size advice', () => {
    expect(describeFailure({ kind: 'too-large', bytes: 60 * MB, isVideo: true }, { durationSec: 30 })).toMatch(
      /about 10 seconds/,
    );
  });
});

describe('withTimeout', () => {
  afterEach(() => vi.useRealTimers());

  it('resolves with the work when it finishes first', async () => {
    await expect(withTimeout(Promise.resolve(42), 1000)).resolves.toBe(42);
  });

  it('rejects with TimeoutError when the work hangs', async () => {
    vi.useFakeTimers();
    const pending = withTimeout(new Promise(() => {}), 1000);
    vi.advanceTimersByTime(1001);
    await expect(pending).rejects.toBeInstanceOf(TimeoutError);
  });

  it('rejects with the abort reason as soon as the signal fires', async () => {
    const controller = new AbortController();
    const pending = withTimeout(new Promise(() => {}), 60_000, controller.signal);
    controller.abort('removed');
    await expect(pending).rejects.toBe('removed');
    // Already aborted before starting.
    await expect(withTimeout(Promise.resolve(1), 1000, controller.signal)).rejects.toBe('removed');
  });
});

describe('withVisibleTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('rejects with TimeoutError after that much time on screen', async () => {
    vi.useFakeTimers();
    const pending = withVisibleTimeout(new Promise(() => {}), 1000);
    vi.advanceTimersByTime(1250);
    await expect(pending).rejects.toBeInstanceOf(TimeoutError);
  });

  it('does not count time the page spent hidden', async () => {
    vi.useFakeTimers();
    const doc = { visibilityState: 'hidden' };
    vi.stubGlobal('document', doc);
    let settled = false;
    const pending = withVisibleTimeout(new Promise(() => {}), 1000).catch((err) => {
      settled = true;
      throw err;
    });
    vi.advanceTimersByTime(60_000);
    await Promise.resolve();
    expect(settled).toBe(false);
    doc.visibilityState = 'visible';
    vi.advanceTimersByTime(1250);
    await expect(pending).rejects.toBeInstanceOf(TimeoutError);
  });

  it('rejects with the abort reason when the task is removed', async () => {
    const controller = new AbortController();
    const pending = withVisibleTimeout(new Promise(() => {}), 60_000, controller.signal);
    controller.abort('removed');
    await expect(pending).rejects.toBe('removed');
  });
});

describe('planPrepareTimeout', () => {
  it('leaves the backstop room over compressImage’s own fallbacks', () => {
    // The 20s decode limit, then up to 4s patching a HEIC's location.
    expect(COMPRESS_TIMEOUT_MS).toBeGreaterThanOrEqual(PREP_TIMEOUT_MS + 4_000 + 5_000);
  });

  it('patches a HEIC’s location rather than sending it as it was', () => {
    expect(planPrepareTimeout('image/heic', 1)).toEqual({ action: 'strip-heic' });
    expect(planPrepareTimeout('image/heif', 1)).toEqual({ action: 'strip-heic' });
    // The patch timed out too: fail it (retryable) rather than upload GPS.
    expect(planPrepareTimeout('image/heic', 2)).toEqual({ action: 'fail', failure: { kind: 'prepare' } });
  });

  it('sends formats the server scrubs as they are', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/avif']) {
      expect(planPrepareTimeout(type, 1)).toEqual({ action: 'upload-original' });
    }
  });

  it('gives a video one more try, then fails it with a reason', () => {
    expect(planPrepareTimeout('video/quicktime', 1)).toEqual({ action: 'retry-video' });
    const second = planPrepareTimeout('video/mp4', 2);
    expect(second).toEqual({ action: 'fail', failure: { kind: 'prepare', isVideo: true } });
    if (second.action !== 'fail') throw new Error('expected a failure');
    expect(describeFailure(second.failure)).toBe(
      'We couldn’t prepare this video. Try again, or email it to info@mayells.com.',
    );
    expect(canRetry(second.failure)).toBe(true);
  });

  it('fails anything else', () => {
    expect(planPrepareTimeout('image/gif', 1)).toEqual({ action: 'fail', failure: { kind: 'prepare' } });
  });
});

describe('pickNext', () => {
  const tasks = [
    { id: 'a', status: 'pending' as const },
    { id: 'b', status: 'pending' as const },
    { id: 'c', status: 'complete' as const },
    { id: 'd', status: 'pending' as const },
    { id: 'e', status: 'pending' as const },
  ];

  it('fills free slots up to the concurrency limit', () => {
    expect(pickNext(['a', 'b', 'd', 'e'], tasks, new Set())).toEqual({ start: ['a', 'b', 'd'], queue: ['e'] });
    expect(MAX_CONCURRENT).toBe(3);
  });

  it('starts nothing while every slot is busy', () => {
    expect(pickNext(['d'], tasks, new Set(['x', 'y', 'z']))).toEqual({ start: [], queue: ['d'] });
  });

  it('drops removed, finished, running and duplicate entries', () => {
    expect(pickNext(['gone', 'c', 'a', 'a', 'b'], tasks, new Set(['b']))).toEqual({ start: ['a'], queue: [] });
  });
});

describe('summarizeUploads / sendLabel / buildSubmission', () => {
  const tasks = [
    { id: '1', status: 'complete' as const, resultUrl: 'https://x/1.jpg' },
    { id: '2', status: 'complete' as const, resultUrl: 'https://x/2.jpg' },
    { id: '3', status: 'error' as const },
    { id: '4', status: 'error' as const },
    { id: '5', status: 'uploading' as const },
  ];

  it('lets the seller send what succeeded, and says what did not', () => {
    const items = [
      { taskIds: ['1', '3'], notes: ' Signed lower right ' },
      { taskIds: ['2'], notes: '' },
      { taskIds: ['4'], notes: 'all failed' },
    ];
    const summary = summarizeUploads(items, tasks);
    expect(summary).toMatchObject({ totalMedia: 4, completeMedia: 2, failedMedia: 2, activeMedia: 0, sendableItems: 2 });
    expect(summary.canSend).toBe(true);
    expect(sendLabel(summary)).toEqual({ primary: 'Send 2 items', secondary: '2 couldn’t upload' });
    expect(buildSubmission(items, tasks)).toEqual([
      { images: ['https://x/1.jpg'], sellerNotes: 'Signed lower right' },
      { images: ['https://x/2.jpg'], sellerNotes: undefined },
    ]);
  });

  it('waits while anything is still uploading', () => {
    const summary = summarizeUploads([{ taskIds: ['1', '5'] }], tasks);
    expect(summary.activeMedia).toBe(1);
    expect(summary.canSend).toBe(false);
  });

  it('has nothing to send when every upload failed', () => {
    const summary = summarizeUploads([{ taskIds: ['3'] }], tasks);
    expect(summary.canSend).toBe(false);
    expect(sendLabel(summary)).toEqual({ primary: 'Nothing to send yet' });
  });

  it('says "to Mayells" when everything made it', () => {
    expect(sendLabel(summarizeUploads([{ taskIds: ['1'] }], tasks))).toEqual({ primary: 'Send 1 item to Mayells' });
  });

  it('holds back an item with more photos than the server takes', () => {
    const many = Array.from({ length: MAX_MEDIA_PER_ITEM + 1 }, (_, i) => ({
      id: `m${i}`,
      status: 'complete' as const,
      resultUrl: `https://x/${i}.jpg`,
    }));
    const summary = summarizeUploads([{ taskIds: ['1'] }, { taskIds: many.map((t) => t.id) }], [...tasks, ...many]);
    expect(summary.overfullItems).toEqual([1]);
    expect(summary.canSend).toBe(false);
  });
});
