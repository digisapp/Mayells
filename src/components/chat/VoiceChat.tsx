'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  BarVisualizer,
  useVoiceAssistant,
  useConnectionState,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { ConnectionState } from 'livekit-client';
import { PhoneOff, Loader2, MicOff } from 'lucide-react';

interface VoiceChatProps {
  onClose: () => void;
}

function VoiceChatContent({ onClose }: VoiceChatProps) {
  const { state, audioTrack } = useVoiceAssistant();
  const connectionState = useConnectionState();

  const stateLabel: Record<string, string> = {
    disconnected: 'Disconnected',
    connecting: 'Connecting...',
    'pre-connect-buffering': 'Connecting...',
    initializing: 'Connecting to concierge...',
    idle: 'Connected — start speaking',
    listening: 'Listening...',
    thinking: 'Thinking...',
    speaking: 'Speaking...',
    failed: 'Connection failed',
  };

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-6 py-8 bg-charcoal min-h-[300px]">
      {/* Visualizer */}
      <div className="w-full max-w-[240px] h-[100px] flex items-center justify-center mb-6">
        {connectionState === ConnectionState.Connected ? (
          <BarVisualizer
            state={state}
            track={audioTrack}
            barCount={5}
            className="w-full h-full"
            style={
              {
                '--lk-va-bar-bg': 'rgba(212, 197, 160, 0.15)',
                '--lk-va-bar-active': '#D4C5A0',
              } as React.CSSProperties
            }
          />
        ) : (
          <Loader2 className="h-8 w-8 animate-spin text-champagne" />
        )}
      </div>

      {/* State label */}
      <p className="text-sm text-white/60 mb-8">
        {stateLabel[state] || 'Connecting...'}
      </p>

      {/* End call */}
      <button
        onClick={onClose}
        className="bg-red-500/90 hover:bg-red-500 text-white rounded-full p-4 transition-colors shadow-lg"
        title="End call"
      >
        <PhoneOff className="h-5 w-5" />
      </button>
      <p className="text-[11px] text-white/30 mt-3">Tap to end call</p>
    </div>
  );
}

export function VoiceChat({ onClose }: VoiceChatProps) {
  const [token, setToken] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchToken = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/voice/token', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to get voice token');
      const data = await res.json();
      setToken(data.token);
      setUrl(data.url);
    } catch {
      setError('Could not connect to voice service. Please try again.');
    }
  }, []);

  useEffect(() => {
    fetchToken();
  }, [fetchToken]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 px-6 py-12 bg-charcoal min-h-[300px]">
        <MicOff className="h-8 w-8 text-white/30 mb-4" />
        <p className="text-sm text-white/60 text-center mb-4">{error}</p>
        <button
          onClick={fetchToken}
          className="text-sm text-champagne hover:text-champagne/80 underline transition-colors"
        >
          Try again
        </button>
        <button
          onClick={onClose}
          className="text-sm text-white/40 hover:text-white/60 mt-2 transition-colors"
        >
          Back to chat
        </button>
      </div>
    );
  }

  if (!token || !url) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 px-6 py-12 bg-charcoal min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-champagne mb-4" />
        <p className="text-sm text-white/60">Connecting to concierge...</p>
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={token}
      serverUrl={url}
      connect={true}
      audio={true}
      video={false}
      onError={(err) => {
        console.error('LiveKit error:', err);
        if (err?.message?.includes('Permission') || err?.message?.includes('NotAllowed')) {
          setError('Microphone access is needed for voice chat. Please allow it in your browser settings.');
        } else {
          setError('Voice connection failed. Please try again.');
        }
        setToken(null);
      }}
      onDisconnected={() => {
        // Room disconnected (e.g. agent ended the call)
      }}
      style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
    >
      <RoomAudioRenderer />
      <VoiceChatContent onClose={onClose} />
    </LiveKitRoom>
  );
}
