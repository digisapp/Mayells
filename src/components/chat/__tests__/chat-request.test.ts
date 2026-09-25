import { describe, it, expect } from 'vitest';
import type { UIMessage } from 'ai';
import {
  ChatHttpError,
  EARLIER_PHOTO_PLACEHOLDER,
  chatErrorKind,
  slimChatRequest,
} from '../chat-request';

const photo = (tag: string, size = 10) => `data:image/jpeg;base64,${tag}${'A'.repeat(size)}`;

function user(id: string, text: string, ...photos: string[]): UIMessage {
  return {
    id,
    role: 'user',
    parts: [
      ...photos.map((url) => ({ type: 'file' as const, mediaType: 'image/jpeg', url })),
      { type: 'text' as const, text },
    ],
  };
}

function assistant(id: string, text: string): UIMessage {
  return { id, role: 'assistant', parts: [{ type: 'text', text }] };
}

/** The assistant turn in which requestAppraisal ran, with its result. */
function appraisalResult(id: string, output: Record<string, unknown>): UIMessage {
  return {
    id,
    role: 'assistant',
    parts: [
      {
        type: 'tool-requestAppraisal',
        toolCallId: `call-${id}`,
        state: 'output-available',
        input: {},
        output,
      },
      { type: 'text', text: 'Thank you.' },
    ],
  } as UIMessage;
}

const inlinePhotos = (messages: UIMessage[]) =>
  messages.flatMap((m) => m.parts).filter((p) => p.type === 'file').map((p) => (p as { url: string }).url);

describe('slimChatRequest', () => {
  it('leaves a text-only conversation untouched', () => {
    const messages = [user('1', 'Hello'), assistant('2', 'Hi')];
    const slim = slimChatRequest(messages);
    expect(slim.messages).toEqual(messages);
    expect(slim.earlierPhotos).toEqual([]);
  });

  it('keeps the newest photo inline for a follow-up question', () => {
    const messages = [user('1', 'What is this?', photo('a')), assistant('2', 'A vase'), user('3', 'How old?')];
    const slim = slimChatRequest(messages);
    expect(inlinePhotos(slim.messages)).toEqual([photo('a')]);
    expect(slim.earlierPhotos).toEqual([]);
  });

  it('inlines only the newest photo and carries earlier ones separately', () => {
    const messages = [
      user('1', 'First', photo('a')),
      assistant('2', 'Nice'),
      user('3', 'Second', photo('b')),
      assistant('4', 'Also nice'),
      user('5', 'Third', photo('c')),
    ];
    const slim = slimChatRequest(messages);
    expect(inlinePhotos(slim.messages)).toEqual([photo('c')]);
    expect(slim.earlierPhotos).toEqual([photo('a'), photo('b')]);
    // The model keeps the thread: a placeholder stands where each photo was.
    expect(slim.messages[0].parts).toEqual([
      { type: 'text', text: EARLIER_PHOTO_PLACEHOLDER },
      { type: 'text', text: 'First' },
    ]);
    // The chat's own history is not mutated.
    expect(inlinePhotos(messages)).toHaveLength(3);
  });

  it('caps the earlier photos by count and size, keeping the most recent', () => {
    const many = Array.from({ length: 6 }, (_, i) => user(String(i), `p${i}`, photo(String(i))));
    expect(slimChatRequest(many).earlierPhotos).toEqual([1, 2, 3, 4].map((i) => photo(String(i))));

    const big = [user('1', 'a', photo('a', 1_200_000)), user('2', 'b', photo('b', 1_200_000)), user('3', 'c', photo('c'))];
    expect(slimChatRequest(big).earlierPhotos).toEqual([photo('b', 1_200_000)]);
  });

  it('stops carrying photos a successful request reported on file', () => {
    const before = [
      user('1', 'Vase', photo('a')),
      user('2', 'Base', photo('b')),
      appraisalResult('3', { ok: true, photosAttached: 2 }),
    ];
    // Right after the request, nothing earlier needs to travel again.
    expect(slimChatRequest([...before, user('4', 'Thanks')]).earlierPhotos).toEqual([]);
    // A second piece's photos are still carried for the next request.
    const later = [...before, user('4', 'And a clock', photo('c')), assistant('5', 'Lovely'), user('6', 'Its key', photo('d'))];
    const slim = slimChatRequest(later);
    expect(slim.earlierPhotos).toEqual([photo('c')]);
    expect(inlinePhotos(slim.messages)).toEqual([photo('d')]);
  });

  it('keeps carrying photos when the request failed or attached none', () => {
    const shared = [user('1', 'Vase', photo('a')), user('2', 'Base', photo('b'))];
    const failed = slimChatRequest([...shared, appraisalResult('3', { ok: false, message: 'Ask for a phone' })]);
    expect(failed.earlierPhotos).toEqual([photo('a')]);
    const none = slimChatRequest([...shared, appraisalResult('3', { ok: true, photosAttached: 0 })]);
    expect(none.earlierPhotos).toEqual([photo('a')]);
  });

  it('moves a photo older than the server history window out of the messages', () => {
    const messages = [user('0', 'Look', photo('old'))];
    for (let i = 1; i <= 20; i++) messages.push(i % 2 ? assistant(String(i), 'ok') : user(String(i), 'more'));
    const slim = slimChatRequest(messages);
    expect(inlinePhotos(slim.messages)).toEqual([]);
    expect(slim.earlierPhotos).toEqual([photo('old')]);
  });
});

describe('chatErrorKind', () => {
  it('maps HTTP failures to what the visitor can do about them', () => {
    expect(chatErrorKind(new ChatHttpError(429, '{"error":"Rate limit exceeded."}'))).toBe('rate-limited');
    expect(chatErrorKind(new ChatHttpError(413, 'Request Entity Too Large'))).toBe('too-large');
    expect(chatErrorKind(new ChatHttpError(500, ''))).toBe('failed');
  });

  it('treats dropped connections and offline as offline', () => {
    expect(chatErrorKind(new TypeError('Load failed'))).toBe('offline');
    expect(chatErrorKind(new TypeError('Failed to fetch'))).toBe('offline');
    expect(chatErrorKind(new Error('An error occurred.'), false)).toBe('offline');
    expect(chatErrorKind(new Error('An error occurred.'))).toBe('failed');
  });
});
