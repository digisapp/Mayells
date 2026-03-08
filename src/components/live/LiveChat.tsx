'use client';

import { useState, useRef, useEffect } from 'react';
import { useLiveChat, type ChatMessage } from '@/hooks/useLiveChat';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Send, Heart, Star, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';

const REACTIONS = [
  { emoji: '🔥', icon: Flame, label: 'Fire' },
  { emoji: '❤️', icon: Heart, label: 'Love' },
  { emoji: '⭐', icon: Star, label: 'Star' },
];

interface LiveChatProps {
  auctionId: string;
  className?: string;
}

export function LiveChat({ auctionId, className }: LiveChatProps) {
  const { messages, connected, sendMessage } = useLiveChat(auctionId);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  function handleSend() {
    if (!input.trim()) return;
    sendMessage(input.trim());
    setInput('');
  }

  return (
    <div className={cn('flex flex-col h-full bg-background rounded-lg border border-white/10', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <h3 className="text-white font-medium text-sm">Live Chat</h3>
        <div className="flex items-center gap-1.5">
          <div className={cn('w-2 h-2 rounded-full', connected ? 'bg-green-400' : 'bg-red-400')} />
          <span className="text-xs text-white/50">{connected ? 'Connected' : 'Connecting...'}</span>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-2 space-y-2 min-h-0">
        {messages.map((msg, i) => (
          <ChatBubble key={i} message={msg} />
        ))}
        {messages.length === 0 && (
          <p className="text-white/30 text-sm text-center py-8">Chat will appear here when the auction goes live.</p>
        )}
      </div>

      {/* Reactions */}
      <div className="flex gap-1 px-4 py-2 border-t border-white/10">
        {REACTIONS.map((r) => (
          <Button
            key={r.label}
            variant="ghost"
            size="sm"
            className="text-white/50 hover:text-white hover:bg-white/10 h-8 px-3"
            onClick={() => sendMessage(r.emoji, 'reaction')}
          >
            {r.emoji}
          </Button>
        ))}
      </div>

      {/* Input */}
      <div className="flex gap-2 px-4 py-3 border-t border-white/10">
        <Input
          placeholder="Say something..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          className="bg-white/5 border-white/10 text-white placeholder:text-white/30 h-9"
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={!input.trim()}
          className="bg-champagne text-charcoal hover:bg-champagne/90 h-9 w-9 flex-shrink-0"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  if (message.messageType === 'reaction') {
    return (
      <div className="text-center">
        <span className="text-2xl animate-bounce inline-block">{message.message}</span>
      </div>
    );
  }

  if (message.messageType === 'bid_notification') {
    return (
      <div className="bg-champagne/10 border border-champagne/20 rounded px-3 py-2">
        <p className="text-champagne text-sm font-medium">{message.message}</p>
      </div>
    );
  }

  const isAuctioneer = message.role === 'auctioneer' || message.role === 'admin';

  return (
    <div className="text-sm">
      <span className={cn('font-medium', isAuctioneer ? 'text-champagne' : 'text-white/80')}>
        {message.displayName}
        {isAuctioneer && <Badge className="ml-1 text-[10px] px-1 py-0 bg-champagne/20 text-champagne">Auctioneer</Badge>}
      </span>
      <span className="text-white/60 ml-2">{message.message}</span>
    </div>
  );
}
