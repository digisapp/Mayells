'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type FileUIPart } from 'ai';
import { X, Send, Loader2, Camera, Phone, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { compressImage } from '@/lib/upload/compress-image';
import { BUSINESS } from '@/lib/config';
import { getMicrositeBySlug, micrositePhone } from '@/lib/microsites/config';
import {
  CHAT_PHOTO_MAX_DIM,
  CHAT_PHOTO_QUALITY,
  CHAT_PHOTO_TYPES,
  MAX_CHAT_PHOTO_BYTES,
  chatErrorKind,
  chatFetch,
  slimChatRequest,
  type ChatErrorKind,
} from './chat-request';
import { useIsPhone, useVisualViewport } from './use-viewport';

interface ChatPanelProps {
  /** DOM id, referenced by the launcher's aria-controls. */
  id: string;
  /** Panel stays mounted after first open (chat history survives close); this toggles visibility. */
  visible: boolean;
  onClose: () => void;
  /** Message injected by an external open-chat event; sent once when the panel first loads. */
  pendingMessage: string | null;
  onPendingConsumed: () => void;
  /** City microsite slug, so the concierge answers for that town and attributes any lead to it. */
  site?: string;
  /** Extra bottom offset (Tailwind classes) for the floating card when the page has its own sticky bar. */
  offsetClassName?: string;
}

interface Photo {
  /** The compressed file actually sent. */
  file: File;
  /** Object URL for the composer thumbnail; revoked when the photo is sent or removed. */
  previewUrl: string;
  dataUrl: string;
}

/** Sanity bound before decoding; anything a phone camera produces is well below it. */
const MAX_SOURCE_BYTES = 40 * 1024 * 1024;
const PHOTO_ONLY_PROMPT = 'What can you tell me about this item?';

const SUGGESTIONS = [
  'I’d like a free appraisal',
  'How does consigning work?',
  'What’s coming up at auction?',
];

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function messageText(m: { parts: { type: string }[] }): string {
  return m.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

/**
 * The heavy half of the chat widget: the AI SDK, transport, and dialog UI.
 * Loaded via next/dynamic from ChatWidget on first open so none of this is in
 * the shared public-page bundle, and the greeting fetch happens on first open
 * instead of on every page view.
 *
 * On phones it is a full-screen sheet that tracks the visual viewport (so the
 * composer stays above the iOS keyboard); on larger screens, a floating card.
 */
export function ChatPanel({ id, visible, onClose, pendingMessage, onPendingConsumed, site, offsetClassName }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const [greeting, setGreeting] = useState('Welcome to Mayells! How can we help you today?');
  const [chatEnabled, setChatEnabled] = useState(true);
  const isPhone = useIsPhone();
  const viewport = useVisualViewport();
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const openChatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/ai/chat',
        body: site ? { site } : undefined,
        fetch: chatFetch,
        // Send only the newest photo for the model to look at; earlier ones
        // ride along separately for lead attachment (see slimChatRequest).
        prepareSendMessagesRequest: ({ id: chatId, messages, body, trigger, messageId }) => {
          const slim = slimChatRequest(messages);
          return {
            body: {
              ...body,
              id: chatId,
              messages: slim.messages,
              trigger,
              messageId,
              ...(slim.earlierPhotos.length > 0 ? { earlierPhotos: slim.earlierPhotos } : {}),
            },
          };
        },
      }),
    [site],
  );
  const { messages, sendMessage, status, error, regenerate, clearError, setMessages } = useChat({ transport });

  const contact = useMemo(() => {
    const micro = site ? getMicrositeBySlug(site) : undefined;
    const phone = micro ? micrositePhone(micro) : { display: BUSINESS.phone, href: BUSINESS.phoneHref };
    return { phone, email: BUSINESS.email };
  }, [site]);

  // Fetch custom greeting and enabled status — once, on first open (mount)
  useEffect(() => {
    fetch('/api/ai/chat-greeting')
      .then((r) => r.json())
      .then((data) => {
        if (data.greeting) setGreeting(data.greeting);
        if (data.enabled === false) setChatEnabled(false);
      })
      .catch(() => {});
  }, []);

  // Keep the newest message (and any error notice) in view, including when
  // the keyboard opening shrinks the list. Scrolls the list itself:
  // scrollIntoView would also scroll the page behind the panel.
  useEffect(() => {
    const list = listRef.current;
    // Nothing to follow yet: leave the greeting where it starts.
    if (!list || messages.length === 0) return;
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    list.scrollTo({ top: list.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, [messages, status, visible, viewport.height]);

  // Auto-send a message injected by the open-chat event (e.g. appraisal CTA)
  useEffect(() => {
    if (pendingMessage && messages.length === 0) {
      openChatTimerRef.current = setTimeout(() => sendMessage({ text: pendingMessage }), 300);
      onPendingConsumed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingMessage]);

  // Clear any pending auto-send timer on unmount
  useEffect(() => {
    return () => {
      if (openChatTimerRef.current) clearTimeout(openChatTimerRef.current);
    };
  }, []);

  // Release the composer thumbnail's object URL once it is replaced or sent.
  useEffect(() => {
    if (!photo) return;
    const url = photo.previewUrl;
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  // Move focus into the panel on open. With a fine pointer that is the
  // composer; on touch screens the panel itself, so the keyboard doesn't
  // spring up over the greeting before the visitor has read it.
  useEffect(() => {
    if (!visible) return;
    if (window.matchMedia('(pointer: fine)').matches && inputRef.current) inputRef.current.focus();
    else panelRef.current?.focus({ preventScroll: true });
  }, [visible, chatEnabled]);

  // The phone sheet is modal: lock the page behind it.
  useEffect(() => {
    if (!visible || !isPhone) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [visible, isPhone]);

  if (!visible) return null;

  const isLoading = status === 'submitted' || status === 'streaming';
  const errorKind: ChatErrorKind | null =
    status === 'error' ? chatErrorKind(error, typeof navigator === 'undefined' || navigator.onLine) : null;
  const lastMessage = messages[messages.length - 1];
  // Tool calls (auction lookups, web search) stream no text for a while.
  const awaitingText = isLoading && (!lastMessage || lastMessage.role === 'user' || !messageText(lastMessage));
  const failedWithPhoto = errorKind !== null && lastMessage?.role === 'user' && lastMessage.parts.some((p) => p.type === 'file');
  const keyboardOpen = viewport.keyboardInset > 0;

  /** Drop the message the server refused, optionally handing its text back to the composer. */
  const dropFailedMessage = (restoreText: boolean) => {
    const failed = messages[messages.length - 1];
    if (failed?.role !== 'user') return;
    const text = messageText(failed);
    setMessages(messages.slice(0, -1));
    clearError();
    if (restoreText && text && text !== PHOTO_ONLY_PROMPT) setInput(text);
  };

  const send = (text: string, withPhoto: Photo | null) => {
    // A photo the server refused would otherwise ride along again as the newest one.
    if (errorKind === 'too-large') dropFailedMessage(false);
    if (withPhoto) {
      const file: FileUIPart = {
        type: 'file',
        mediaType: withPhoto.file.type,
        filename: withPhoto.file.name,
        url: withPhoto.dataUrl,
      };
      sendMessage({ text: text || PHOTO_ONLY_PROMPT, files: [file] });
    } else {
      sendMessage({ text });
    }
  };

  const handleSend = (raw: string) => {
    const text = raw.trim();
    if ((!text && !photo) || isLoading || preparingPhoto) return;
    setInput('');
    setPhoto(null);
    send(text, photo);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picker = e.currentTarget;
    const file = picker.files?.[0];
    // Reset so choosing the same photo again still fires a change event.
    picker.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please choose a photo (JPEG, PNG or WebP).');
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      toast.error('That photo is too large. Please choose a smaller one.');
      return;
    }

    setPreparingPhoto(true);
    try {
      // Phone photos are 3–8MB; inlined as base64 they overflow the request
      // limit. A 1280px JPEG is ample for the concierge to judge the item.
      const compressed = await compressImage(file, CHAT_PHOTO_MAX_DIM, CHAT_PHOTO_QUALITY);
      if (!CHAT_PHOTO_TYPES.includes(compressed.type)) {
        toast.error('We couldn’t read that photo. Please try a JPEG or PNG.');
        return;
      }
      if (compressed.size > MAX_CHAT_PHOTO_BYTES) {
        toast.error(`That photo is too large to send here. Please try another, or email it to ${contact.email}.`);
        return;
      }
      const dataUrl = await readAsDataUrl(compressed);
      setPhoto({ file: compressed, previewUrl: URL.createObjectURL(compressed), dataUrl });
    } catch {
      toast.error('We couldn’t read that photo. Please try another.');
    } finally {
      setPreparingPhoto(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    // The phone sheet is modal, so Tab cycles within it.
    if (e.key !== 'Tab' || !isPhone || !panelRef.current) return;
    const focusable = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([type="file"]):not([disabled])',
      ),
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const contactLinks = (
    <div className="flex flex-wrap gap-2">
      <a
        href={contact.phone.href}
        className="inline-flex h-11 items-center gap-2 rounded-full bg-charcoal px-4 text-sm font-semibold text-white hover:bg-charcoal/85"
      >
        <Phone className="h-4 w-4" aria-hidden />
        {contact.phone.display}
      </a>
      <a
        href={`mailto:${contact.email}`}
        className="inline-flex h-11 items-center gap-2 rounded-full border border-charcoal/20 px-4 text-sm font-semibold text-charcoal hover:border-charcoal/40"
      >
        <Mail className="h-4 w-4" aria-hidden />
        Email us
      </a>
    </div>
  );

  const errorNotice = errorKind && (
    <div role="alert" className="rounded-xl border border-champagne/60 bg-ivory px-4 py-3 text-[15px] leading-relaxed text-charcoal">
      {errorKind === 'rate-limited' ? (
        <>
          <p>You’ve sent a lot of messages in a short time, so the chat is paused for now. A specialist can help straight away by phone or email.</p>
          <div className="mt-3">{contactLinks}</div>
        </>
      ) : errorKind === 'too-large' ? (
        <>
          <p>
            {failedWithPhoto
              ? 'That photo was too large to send. Please try a different one.'
              : 'That message was too long to send. Please shorten it and try again.'}
          </p>
          <button
            type="button"
            onClick={() => dropFailedMessage(true)}
            className="mt-2 inline-flex h-11 items-center rounded-full bg-charcoal px-5 text-sm font-semibold text-white hover:bg-charcoal/85"
          >
            {failedWithPhoto ? 'Remove photo' : 'Edit message'}
          </button>
        </>
      ) : (
        <>
          <p>
            {errorKind === 'offline'
              ? 'We couldn’t reach Mayells. Check your connection and try again.'
              : 'Sorry, your message didn’t go through.'}
          </p>
          <button
            type="button"
            onClick={() => regenerate()}
            className="mt-2 inline-flex h-11 items-center rounded-full bg-charcoal px-5 text-sm font-semibold text-white hover:bg-charcoal/85"
          >
            Try again
          </button>
        </>
      )}
    </div>
  );

  // Phone: a sheet over the whole visible area. Its box follows the visual
  // viewport so the composer rides above the keyboard, and the safe areas pad
  // the header and composer. From sm up: the floating card, lifted above the
  // keyboard on tablets.
  const frameClass = isPhone
    ? 'fixed inset-x-0 top-0 z-[60] flex flex-col bg-white outline-none'
    : `${offsetClassName ?? 'bottom-[calc(max(1rem,env(safe-area-inset-bottom))+4rem)]'} fixed right-6 z-50 w-[440px] max-w-[calc(100vw-3rem)] max-h-[min(580px,calc(100dvh-7rem))] bg-white rounded-2xl shadow-2xl border border-black/10 flex flex-col overflow-hidden outline-none`;
  const frameStyle: React.CSSProperties | undefined = isPhone
    ? viewport.height > 0 && !viewport.zoomed
      ? { top: viewport.top, height: viewport.height }
      : { height: '100dvh' }
    : keyboardOpen
      ? { transform: `translateY(-${viewport.keyboardInset}px)`, maxHeight: Math.max(viewport.height - 96, 220) }
      : undefined;

  return (
    <div
      ref={panelRef}
      id={id}
      role="dialog"
      aria-modal={isPhone || undefined}
      aria-labelledby={`${id}-title`}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className={frameClass}
      style={frameStyle}
    >
      {/* Header */}
      <div
        className={`bg-charcoal text-white flex items-center justify-between flex-shrink-0 ${
          isPhone
            ? 'pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-[max(0.625rem,env(safe-area-inset-top))] pb-2.5'
            : 'pl-6 pr-3.5 py-3.5'
        }`}
      >
        <h3 id={`${id}-title`} className={`font-display ${isPhone ? 'text-[22px]' : 'text-2xl'}`}>
          Mayells Concierge
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
          className="flex h-11 w-11 items-center justify-center rounded-full text-white/70 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne"
        >
          <X className="h-6 w-6" aria-hidden />
        </button>
      </div>

      {!chatEnabled ? (
        <div className="flex-1 px-6 py-10 text-center">
          <p className="font-display text-xl text-charcoal">Our concierge is offline</p>
          <p className="mt-2 text-base text-gray-500">
            A specialist can help by phone or email.
          </p>
          <div className="mt-6 flex justify-center">{contactLinks}</div>
        </div>
      ) : (
        <>
          {/* Messages */}
          <div
            ref={listRef}
            className={`flex-1 overflow-y-auto overscroll-contain space-y-4 ${
              isPhone
                ? 'min-h-0 py-5 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]'
                : `px-5 py-5 max-h-[380px] ${keyboardOpen ? 'min-h-0' : 'min-h-[220px]'}`
            }`}
          >
            {messages.length === 0 && (
              <div className={isPhone ? 'pt-4' : 'text-center py-8'}>
                <p className={`text-base ${isPhone ? 'text-charcoal/75 leading-relaxed' : 'text-gray-500'}`}>{greeting}</p>
                {isPhone && (
                  <div className="mt-6 flex flex-col items-start gap-2.5">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => send(s, null)}
                        className="min-h-11 rounded-full border border-champagne/70 px-4 py-2 text-left text-[15px] text-charcoal transition-colors active:bg-ivory"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {messages.map((m) => {
              const text = messageText(m);
              const images = m.parts.filter(
                (p): p is FileUIPart => p.type === 'file' && p.mediaType.startsWith('image/'),
              );
              if (!text && images.length === 0) return null;

              return (
                <div
                  key={m.id}
                  className={`flex flex-col gap-1.5 ${m.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  {images.map((img, i) => (
                    // eslint-disable-next-line @next/next/no-img-element -- visitor's own photo (data URL)
                    <img
                      key={i}
                      src={img.url}
                      alt="Your photo"
                      className="h-40 w-40 rounded-2xl rounded-br-md border border-black/10 object-cover"
                    />
                  ))}
                  {text && (
                    <div
                      className={`max-w-[85%] rounded-2xl px-5 py-3 text-base leading-relaxed whitespace-pre-wrap break-words ${
                        m.role === 'user'
                          ? 'bg-charcoal text-white rounded-br-md'
                          : 'bg-ivory text-charcoal rounded-bl-md'
                      }`}
                    >
                      {text}
                    </div>
                  )}
                </div>
              );
            })}

            {awaitingText && (
              <div className="flex justify-start">
                <div className="bg-ivory text-charcoal rounded-2xl rounded-bl-md px-5 py-3" role="status">
                  <Loader2 className="h-5 w-5 animate-spin text-champagne" aria-hidden />
                  <span className="sr-only">The concierge is replying</span>
                </div>
              </div>
            )}

            {errorNotice}
          </div>

          {/* Photo preview */}
          {(photo || preparingPhoto) && (
            <div
              className={`py-2 border-t border-black/5 flex items-center gap-3 ${
                isPhone ? 'pl-[max(1rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]' : 'px-5'
              }`}
            >
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element -- local file preview
                <img
                  src={photo.previewUrl}
                  alt="Photo to send"
                  className="h-14 w-14 object-cover rounded-lg border border-black/10"
                />
              ) : (
                <div className="h-14 w-14 rounded-lg bg-ivory flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-champagne" aria-hidden />
                </div>
              )}
              <span className="text-sm text-gray-500 flex-1" aria-live="polite">
                {photo ? 'Photo ready to send' : 'Preparing photo…'}
              </span>
              {photo && (
                <button
                  type="button"
                  onClick={() => setPhoto(null)}
                  aria-label="Remove photo"
                  className="flex h-11 w-11 items-center justify-center rounded-full text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              )}
            </div>
          )}

          {/* Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(input);
            }}
            className={`border-t border-black/5 flex items-center gap-1.5 flex-shrink-0 ${
              isPhone
                ? `pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-2 ${keyboardOpen ? 'pb-2' : 'pb-[max(0.5rem,env(safe-area-inset-bottom))]'}`
                : 'pl-3 pr-5 py-3'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileSelect}
              className="hidden"
              tabIndex={-1}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={preparingPhoto}
              aria-label="Add a photo"
              title="Add a photo"
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:text-champagne-deep disabled:opacity-40"
            >
              <Camera className="h-6 w-6" aria-hidden />
            </button>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              aria-label="Message"
              enterKeyHint="send"
              autoComplete="off"
              maxLength={4000}
              placeholder={
                photo
                  ? 'Add a note (optional)'
                  : isPhone
                    ? 'How can we help?'
                    : 'Ask about appraisals, consignment...'
              }
              className="min-w-0 flex-1 h-11 px-1 text-base bg-transparent outline-none placeholder:text-gray-400 text-charcoal"
            />
            <button
              type="submit"
              disabled={(!input.trim() && !photo) || isLoading || preparingPhoto}
              aria-label="Send message"
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center bg-charcoal text-white rounded-full hover:bg-charcoal/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="h-5 w-5" aria-hidden />
            </button>
          </form>
        </>
      )}
    </div>
  );
}
