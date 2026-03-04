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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { messages, sendMessage, status } = useChat({ transport });

  const isLoading = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
        <div className="fixed bottom-20 right-4 sm:right-6 z-50 w-[340px] sm:w-[380px] max-h-[500px] bg-white rounded-2xl shadow-2xl border border-black/10 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-charcoal text-white px-5 py-4 flex items-center justify-between flex-shrink-0">
            <div>
              <h3 className="font-display text-base">Mayells Concierge</h3>
              <p className="text-[11px] text-white/50">Ask us anything — or upload a photo</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-white/60 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-[200px] max-h-[340px]">
            {messages.length === 0 && (
              <div className="text-center py-6">
                <p className="text-sm text-gray-500 mb-3">
                  Welcome to Mayells! How can we help you today?
                </p>
                <div className="space-y-2">
                  {[
                    'How do I get a free appraisal?',
                    'What upcoming auctions do you have?',
                    'What do you buy?',
                  ].map((q) => (
                    <button
                      key={q}
                      onClick={() => handleSend(q)}
                      className="block w-full text-left text-xs bg-ivory hover:bg-champagne/30 text-charcoal px-3 py-2 rounded-lg transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 w-full text-left text-xs bg-champagne/20 hover:bg-champagne/40 text-charcoal px-3 py-2 rounded-lg transition-colors"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    Upload a photo for a quick assessment
                  </button>
                </div>
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
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-charcoal text-white rounded-br-md'
                        : 'bg-ivory text-charcoal rounded-bl-md'
                    }`}
                  >
                    {fileParts && fileParts.length > 0 && (
                      <div className="mb-2 flex items-center gap-1.5 text-xs opacity-70">
                        <ImageIcon className="h-3 w-3" />
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
                <div className="bg-ivory text-charcoal rounded-2xl rounded-bl-md px-4 py-2.5">
                  <Loader2 className="h-4 w-4 animate-spin text-champagne" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Image Preview */}
          {imagePreview && (
            <div className="px-4 py-2 border-t border-black/5 flex items-center gap-2">
              <img
                src={imagePreview}
                alt="Upload preview"
                className="h-12 w-12 object-cover rounded-lg border border-black/10"
              />
              <span className="text-xs text-gray-500 flex-1">Photo ready to send</span>
              <button
                onClick={() => {
                  setImagePreview(null);
                  setImageFile(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(input);
            }}
            className="border-t border-black/5 px-4 py-3 flex items-center gap-2 flex-shrink-0"
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
              <Camera className="h-5 w-5" />
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={imageFile ? 'Add a message (optional)...' : 'Ask about appraisals, consignment...'}
              className="flex-1 text-sm bg-transparent outline-none placeholder:text-gray-400 text-charcoal"
            />
            <button
              type="submit"
              disabled={(!input.trim() && !imageFile) || isLoading}
              className="bg-champagne text-charcoal rounded-full p-2 hover:bg-champagne/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}

      {/* Floating Bubble */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-4 right-4 sm:right-6 z-50 bg-champagne text-charcoal rounded-full p-4 shadow-lg hover:shadow-xl hover:scale-105 transition-all"
        aria-label="Chat with us"
      >
        {open ? (
          <X className="h-6 w-6" />
        ) : (
          <MessageCircle className="h-6 w-6" />
        )}
      </button>
    </>
  );
}
