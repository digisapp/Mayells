// Decisions behind the seller upload queue (useUploadManager) and the review
// screen, kept free of React and the DOM so they can be unit-tested.

import {
  MAX_MEDIA_PER_ITEM,
  UNSUPPORTED_TYPE_MESSAGE,
  UPLOAD_HELP_EMAIL,
  tooLargeMessage,
} from './limits';
import { startVisibleTimer } from './visible-time';

export const MAX_CONCURRENT = 3;
/** Attempts per file before it is shown as failed (network and server errors only). */
export const MAX_RETRIES = 3;

// Nothing on this page may hold a queue slot forever. These bound each step;
// an iPhone does all of them in a second or two. They count visible time
// (withVisibleTimeout), so a locked phone doesn't use them up. compressImage
// has its own 20s + 4s fallback to a location-stripped original; this is only
// the backstop if it never settles, with room to spare so it can't win a race
// it shouldn't.
export const COMPRESS_TIMEOUT_MS = 30_000;
export const VIDEO_PREPARE_TIMEOUT_MS = 15_000;
/** Patching location out of a HEIC after the backstop fired: bytes only, no decode, so quick. */
export const HEIC_STRIP_TIMEOUT_MS = 8_000;
export const SIGNED_URL_TIMEOUT_MS = 20_000;
/** An upload with no progress for this long, while the page is visible, has stalled. */
export const STALL_TIMEOUT_MS = 30_000;

export type UploadFailure =
  /** Over the size cap. Retrying can't help. */
  | { kind: 'too-large'; bytes: number; isVideo: boolean }
  /** Not a type the server takes. Retrying can't help. */
  | { kind: 'unsupported' }
  /** The phone couldn't process the photo or video (e.g. decoding or location removal hung). */
  | { kind: 'prepare'; isVideo?: boolean }
  /** Offline, dropped, timed out or stalled. Retried automatically on reconnect. */
  | { kind: 'network' }
  /** The server said no (4xx); its message says why. */
  | { kind: 'rejected'; message?: string }
  /** The server or storage had a problem (5xx). */
  | { kind: 'server' };

export class UploadError extends Error {
  constructor(readonly failure: UploadFailure) {
    super(failure.kind);
    this.name = 'UploadError';
  }
}

export class TimeoutError extends Error {
  constructor() {
    super('Timed out');
    this.name = 'TimeoutError';
  }
}

const SIZE_REJECTION = /maximum allowed size|payload too large|too large/i;

/**
 * Turn a failed HTTP response into a failure. `stage` is which request:
 * our signed-url API, or the PUT to storage. A storage 401/403 means the
 * signed URL went stale (a phone asleep mid-upload), and the next attempt
 * asks for a fresh one, so it is worth retrying.
 */
export function failureFromResponse(
  stage: 'signed-url' | 'storage',
  status: number,
  message: string | undefined,
  file: { bytes: number; isVideo: boolean },
): UploadFailure {
  if (status === 0 || status === 408) return { kind: 'network' };
  if (status >= 500) return { kind: 'server' };
  if (stage === 'storage') {
    if (status === 413 || (message && SIZE_REJECTION.test(message))) {
      return { kind: 'too-large', bytes: file.bytes, isVideo: file.isVideo };
    }
    if (status === 401 || status === 403) return { kind: 'server' };
    return { kind: 'rejected' };
  }
  return { kind: 'rejected', message };
}

/** Whether the queue may try again on its own. */
export function isAutoRetryable(failure: UploadFailure): boolean {
  return failure.kind === 'network' || failure.kind === 'server';
}

/** Whether a Retry button makes sense. Size and type problems need a different file. */
export function canRetry(failure: UploadFailure | undefined): boolean {
  return !!failure && failure.kind !== 'too-large' && failure.kind !== 'unsupported';
}

export type RetryDecision =
  | { action: 'retry'; delayMs: number }
  | { action: 'wait-for-network' }
  | { action: 'give-up' };

/**
 * What to do after an attempt fails. Offline failures don't use up an
 * attempt: they wait for the `online` event (or the page coming back into
 * view) instead of burning retries against a dead connection.
 */
export function decideRetry(failure: UploadFailure, retryCount: number, online: boolean): RetryDecision {
  if (!isAutoRetryable(failure)) return { action: 'give-up' };
  if (failure.kind === 'network' && !online) return { action: 'wait-for-network' };
  const next = retryCount + 1;
  if (next < MAX_RETRIES) return { action: 'retry', delayMs: 1000 * 2 ** next };
  return { action: 'give-up' };
}

/** What to tell the seller about a failed photo or video. */
export function describeFailure(
  failure: UploadFailure,
  { online = true, durationSec }: { online?: boolean; durationSec?: number | null } = {},
): string {
  switch (failure.kind) {
    case 'too-large':
      return tooLargeMessage({ bytes: failure.bytes, isVideo: failure.isVideo }, durationSec);
    case 'unsupported':
      return UNSUPPORTED_TYPE_MESSAGE;
    case 'prepare':
      return failure.isVideo
        ? `We couldn’t prepare this video. Try again, or email it to ${UPLOAD_HELP_EMAIL}.`
        : 'This photo couldn’t be prepared on your phone. Try again, or take it again.';
    case 'network':
      return online
        ? 'The connection dropped before this finished. Tap “Try again” to send it.'
        : 'Waiting for a connection. This will upload by itself when you’re back online.';
    case 'rejected':
      return failure.message || `We couldn’t accept this file. Try again, or email it to ${UPLOAD_HELP_EMAIL}.`;
    case 'server':
      return 'Our server had trouble with this one. Tap “Try again” to send it.';
  }
}

type StartTimer = (ms: number, onExpire: () => void) => () => void;

const wallTimer: StartTimer = (ms, onExpire) => {
  const timer = setTimeout(onExpire, ms);
  return () => clearTimeout(timer);
};

function raceTimeout<T>(work: Promise<T>, ms: number, signal: AbortSignal | undefined, start: StartTimer): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      cancel();
      reject(signal!.reason);
    };
    const cancel = start(ms, () => {
      signal?.removeEventListener('abort', onAbort);
      reject(new TimeoutError());
    });
    signal?.addEventListener('abort', onAbort, { once: true });
    work.then(
      (value) => {
        cancel();
        signal?.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (err) => {
        cancel();
        signal?.removeEventListener('abort', onAbort);
        reject(err);
      },
    );
  });
}

/** Race `work` against a timeout and an abort signal. */
export function withTimeout<T>(work: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  return raceTimeout(work, ms, signal, wallTimer);
}

/**
 * The same, counting only time the page is on screen. After the phone has
 * been locked, a wall-clock timeout fires the instant it's unlocked, before
 * the work has had a moment to resume.
 */
export function withVisibleTimeout<T>(work: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  return raceTimeout(work, ms, signal, (t, onExpire) => startVisibleTimer(t, onExpire));
}

/**
 * What to do when preparing a file on the phone ran out of time. Nothing
 * goes up still carrying the seller's location because a timer fired:
 * - a HEIC gets its location patched out of its bytes, under a limit of its
 *   own; if even that runs out, it fails and the seller can try again;
 * - other photos go up as they are, since the server scrubs them after sending;
 * - a video gets one more try at removing its location, then fails with a
 *   reason (the server can't scrub video);
 * - anything else can't be prepared.
 * `attempt` is 1 when the preparation itself timed out, 2 when the fallback did too.
 */
export type PrepareTimeoutPlan =
  | { action: 'strip-heic' }
  | { action: 'upload-original' }
  | { action: 'retry-video' }
  | { action: 'fail'; failure: UploadFailure };

const SERVER_SCRUBBED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

export function planPrepareTimeout(contentType: string, attempt: number): PrepareTimeoutPlan {
  if (contentType.startsWith('video/')) {
    return attempt < 2 ? { action: 'retry-video' } : { action: 'fail', failure: { kind: 'prepare', isVideo: true } };
  }
  if (contentType === 'image/heic' || contentType === 'image/heif') {
    return attempt < 2 ? { action: 'strip-heic' } : { action: 'fail', failure: { kind: 'prepare' } };
  }
  if (SERVER_SCRUBBED_TYPES.has(contentType)) return { action: 'upload-original' };
  return { action: 'fail', failure: { kind: 'prepare' } };
}

// ── Queue ────────────────────────────────────────────────────────────────

type TaskStatus = 'pending' | 'compressing' | 'uploading' | 'complete' | 'error';

interface QueueTask {
  id: string;
  status: TaskStatus;
}

/**
 * Which queued tasks to start now, and the queue left afterwards. Stale
 * entries (removed, finished, failed, or already running) are dropped.
 */
export function pickNext(
  queue: readonly string[],
  tasks: readonly QueueTask[],
  active: ReadonlySet<string>,
  maxConcurrent = MAX_CONCURRENT,
): { start: string[]; queue: string[] } {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const start: string[] = [];
  const rest = [...queue];
  while (active.size + start.length < maxConcurrent && rest.length > 0) {
    const id = rest.shift()!;
    const task = byId.get(id);
    if (!task || task.status !== 'pending' || active.has(id) || start.includes(id)) continue;
    start.push(id);
  }
  return { start, queue: rest };
}

// ── Review / send ────────────────────────────────────────────────────────

interface SummaryItem {
  taskIds: readonly string[];
}

interface SummaryTask extends QueueTask {
  resultUrl?: string;
}

export interface UploadSummary {
  totalMedia: number;
  completeMedia: number;
  failedMedia: number;
  /** Waiting, preparing or uploading. */
  activeMedia: number;
  /** Items with at least one finished upload: what a send would include. */
  sendableItems: number;
  /** 0-based indexes of items with more finished media than one item may carry. */
  overfullItems: number[];
  canSend: boolean;
}

export function summarizeUploads(items: readonly SummaryItem[], tasks: readonly SummaryTask[]): UploadSummary {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const summary: UploadSummary = {
    totalMedia: 0,
    completeMedia: 0,
    failedMedia: 0,
    activeMedia: 0,
    sendableItems: 0,
    overfullItems: [],
    canSend: false,
  };
  items.forEach((item, index) => {
    let complete = 0;
    for (const id of item.taskIds) {
      const task = byId.get(id);
      if (!task) continue;
      summary.totalMedia++;
      if (task.status === 'complete' && task.resultUrl) complete++;
      else if (task.status === 'error') summary.failedMedia++;
      else summary.activeMedia++;
    }
    summary.completeMedia += complete;
    if (complete > 0) summary.sendableItems++;
    if (complete > MAX_MEDIA_PER_ITEM) summary.overfullItems.push(index);
  });
  summary.canSend =
    summary.sendableItems > 0 && summary.activeMedia === 0 && summary.overfullItems.length === 0;
  return summary;
}

/** The send button's words: "Send 7 items" and, if needed, "1 couldn't upload". */
export function sendLabel(summary: UploadSummary): { primary: string; secondary?: string } {
  const n = summary.sendableItems;
  if (n === 0) {
    return { primary: summary.activeMedia > 0 ? 'Finishing your uploads…' : 'Nothing to send yet' };
  }
  const primary = `Send ${n} ${n === 1 ? 'item' : 'items'}`;
  if (summary.failedMedia > 0) return { primary, secondary: `${summary.failedMedia} couldn’t upload` };
  return { primary: `${primary} to Mayells` };
}

export interface SubmissionItem {
  images: string[];
  sellerNotes?: string;
}

/** The POST body's items: every item with a finished upload, only its finished uploads. */
export function buildSubmission(
  items: readonly (SummaryItem & { notes: string })[],
  tasks: readonly SummaryTask[],
): SubmissionItem[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return items
    .map((item) => ({
      images: item.taskIds
        .map((id) => byId.get(id))
        .filter((t): t is SummaryTask => t?.status === 'complete' && !!t.resultUrl)
        .map((t) => t.resultUrl!),
      sellerNotes: item.notes.trim() || undefined,
    }))
    .filter((item) => item.images.length > 0);
}
