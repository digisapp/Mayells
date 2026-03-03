'use client';

import { useState, useRef, useEffect } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { MessageCircle, X, Send, Loader2 } from 'lucide-react';

const transport = new DefaultChatTransport({
  api: '/api/ai/chat',
});

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status } = useChat({ transport });

  const isLoading = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (text: string) => {
    if (!text.trim() || isLoading) return;
    setInput('');
    sendMessage({ text });
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
              <p className="text-[11px] text-white/50">Ask us anything</p>
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
                    'How does consignment work?',
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
                </div>
              </div>
            )}

            {messages.map((m) => {
              const text = m.parts
                ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
                .map((p) => p.text)
                .join('') || '';
              if (!text) return null;
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

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(input);
            }}
            className="border-t border-black/5 px-4 py-3 flex items-center gap-2 flex-shrink-0"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about appraisals, consignment..."
              className="flex-1 text-sm bg-transparent outline-none placeholder:text-gray-400 text-charcoal"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
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
