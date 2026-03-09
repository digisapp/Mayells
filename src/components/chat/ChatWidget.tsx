'use client';

import { useState, useRef, useEffect } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { MessageCircle, X, Send, Loader2, Camera, ImageIcon } from 'lucide-react';

const transport = new DefaultChatTransport({
  api: '/api/ai/chat',
});

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [showLabel, setShowLabel] = useState(true);
  const [greeting, setGreeting] = useState('Welcome to Mayell! How can we help you today?');
  const [chatEnabled, setChatEnabled] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { messages, sendMessage, status } = useChat({ transport });

  // Fetch custom greeting and enabled status
  useEffect(() => {
    fetch('/api/ai/chat-greeting')
      .then((r) => r.json())
      .then((data) => {
        if (data.greeting) setGreeting(data.greeting);
        if (data.enabled === false) setChatEnabled(false);
      })
      .catch(() => {});
  }, []);

  // Hide the text label after 8 seconds to reduce visual noise
  useEffect(() => {
    const timer = setTimeout(() => setShowLabel(false), 8000);
    return () => clearTimeout(timer);
  }, []);

  if (!chatEnabled) return null;

  const isLoading = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Listen for external open-chat events (e.g. from appraisal CTA)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setOpen(true);
      if (detail?.message && messages.length === 0) {
        setTimeout(() => sendMessage({ text: detail.message }), 300);
      }
    };
    window.addEventListener('open-chat', handler);
    return () => window.removeEventListener('open-chat', handler);
  }, [messages.length, sendMessage]);

  const handleSend = (text: string) => {
    if ((!text.trim() && !imageFile) || isLoading) return;

    const files = imageFile
      ? [new File([imageFile], imageFile.name, { type: imageFile.type })]
      : undefined;

    setInput('');
    setImagePreview(null);
    setImageFile(null);

    if (files) {
      const fileList = new DataTransfer();
      files.forEach((f) => fileList.items.add(f));
      sendMessage({
        text: text.trim() || 'What can you tell me about this item?',
        files: fileList.files,
      });
    } else {
      sendMessage({ text });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) return;
    if (file.size > 20 * 1024 * 1024) return; // 20MB limit

    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <>
      {/* Chat Dialog */}
      {open && (
        <div className="fixed bottom-20 right-4 sm:right-6 z-50 w-[370px] sm:w-[440px] max-h-[580px] bg-white rounded-2xl shadow-2xl border border-black/10 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-charcoal text-white px-6 py-5 flex items-center justify-between flex-shrink-0">
            <div>
              <h3 className="font-display text-2xl">Mayell Concierge</h3>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-white/60 hover:text-white transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Messages */}
              <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4 min-h-[220px] max-h-[380px]">
                {messages.length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-base text-gray-500">
                      {greeting}
                    </p>
                  </div>
                )}

                {messages.map((m) => {
                  const textParts = m.parts?.filter(
                    (p): p is { type: 'text'; text: string } => p.type === 'text',
                  );
                  const text = textParts?.map((p) => p.text).join('') || '';

                  // Check for image parts in user messages
                  const fileParts = m.parts?.filter(
                    (p) => p.type === 'file',
                  );

                  if (!text && (!fileParts || fileParts.length === 0)) return null;

                  return (
                    <div
                      key={m.id}
                      className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-5 py-3 text-base leading-relaxed ${
                          m.role === 'user'
                            ? 'bg-charcoal text-white rounded-br-md'
                            : 'bg-ivory text-charcoal rounded-bl-md'
                        }`}
                      >
                        {fileParts && fileParts.length > 0 && (
                          <div className="mb-2 flex items-center gap-1.5 text-sm opacity-70">
                            <ImageIcon className="h-4 w-4" />
                            Photo attached
                          </div>
                        )}
                        {text}
                      </div>
                    </div>
                  );
                })}

                {isLoading && messages[messages.length - 1]?.role === 'user' && (
                  <div className="flex justify-start">
                    <div className="bg-ivory text-charcoal rounded-2xl rounded-bl-md px-5 py-3">
                      <Loader2 className="h-5 w-5 animate-spin text-champagne" />
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Image Preview */}
              {imagePreview && (
                <div className="px-5 py-3 border-t border-black/5 flex items-center gap-3">
                  <img
                    src={imagePreview}
                    alt="Upload preview"
                    className="h-14 w-14 object-cover rounded-lg border border-black/10"
                  />
                  <span className="text-sm text-gray-500 flex-1">Photo ready to send</span>
                  <button
                    onClick={() => {
                      setImagePreview(null);
                      setImageFile(null);
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              )}

              {/* Input */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend(input);
                }}
                className="border-t border-black/5 px-5 py-4 flex items-center gap-3 flex-shrink-0"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-gray-400 hover:text-champagne transition-colors flex-shrink-0"
                  title="Upload a photo"
                >
                  <Camera className="h-6 w-6" />
                </button>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={imageFile ? 'Add a message (optional)...' : 'Ask about appraisals, consignment...'}
                  className="flex-1 text-base bg-transparent outline-none placeholder:text-gray-400 text-charcoal"
                />
                <button
                  type="submit"
                  disabled={(!input.trim() && !imageFile) || isLoading}
                  className="bg-charcoal text-white rounded-full p-2.5 hover:bg-charcoal/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Send className="h-5 w-5" />
                </button>
              </form>
        </div>
      )}

      {/* Floating Bubble */}
      <button
        onClick={() => {
          setOpen(!open);
          setShowLabel(false);
        }}
        className={`fixed bottom-4 right-4 sm:right-6 z-50 bg-champagne text-charcoal shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center gap-2 ${
          open ? 'rounded-full p-4' : 'rounded-full py-4 px-5'
        } ${!open && showLabel ? 'animate-bounce-gentle' : ''}`}
        aria-label="Chat with us"
      >
        {open ? (
          <X className="h-7 w-7" />
        ) : (
          <>
            <MessageCircle className="h-7 w-7" />
            <span
              className={`font-semibold text-base whitespace-nowrap overflow-hidden transition-all duration-500 ${
                showLabel ? 'max-w-[130px] opacity-100' : 'max-w-0 opacity-0'
              }`}
            >
              Chat With Us
            </span>
          </>
        )}
      </button>
    </>
  );
}
