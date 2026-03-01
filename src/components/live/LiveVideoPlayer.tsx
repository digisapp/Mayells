'use client';

import { useEffect, useState } from 'react';
import {
  LiveKitRoom,
  VideoTrack,
  RoomAudioRenderer,
  useConnectionState,
  useTracks,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { ConnectionState, Track } from 'livekit-client';
import { cn } from '@/lib/utils';

interface LiveVideoPlayerProps {
  auctionId: string;
  className?: string;
}

export function LiveVideoPlayer({ auctionId, className }: LiveVideoPlayerProps) {
  const [token, setToken] = useState<string | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function getToken() {
      try {
        const res = await fetch(`/api/live/${auctionId}/token`, { method: 'POST' });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || 'Failed to join');
          return;
        }
        const data = await res.json();
        setToken(data.token);
        setRoomName(data.roomName);
      } catch {
        setError('Failed to connect');
      }
    }
    getToken();
  }, [auctionId]);

  if (error) {
    return (
      <div className={cn('bg-[#0E1117] rounded-lg flex items-center justify-center', className)}>
        <p className="text-white/50">{error}</p>
      </div>
    );
  }

  if (!token || !roomName) {
    return (
      <div className={cn('bg-[#0E1117] rounded-lg flex items-center justify-center', className)}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-champagne border-t-transparent rounded-full animate-spin" />
          <p className="text-white/50 text-sm">Connecting to live stream...</p>
        </div>
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={token}
      serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
      className={cn('bg-[#0E1117] rounded-lg overflow-hidden', className)}
      connect={true}
    >
      <LiveVideoContent />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

function LiveVideoContent() {
  const connectionState = useConnectionState();
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare]);

  const videoTrack = tracks.find(
    (t) => t.source === Track.Source.Camera || t.source === Track.Source.ScreenShare,
  );

  if (connectionState !== ConnectionState.Connected) {
    return (
      <div className="aspect-video flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-champagne border-t-transparent rounded-full animate-spin" />
          <p className="text-white/50 text-sm">
            {connectionState === ConnectionState.Connecting ? 'Connecting...' : 'Reconnecting...'}
          </p>
        </div>
      </div>
    );
  }

  if (!videoTrack) {
    return (
      <div className="aspect-video flex items-center justify-center bg-gradient-to-b from-[#0E1117] to-[#1a1f2e]">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-champagne/10 flex items-center justify-center mx-auto mb-3">
            <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
          </div>
          <p className="text-white font-display text-lg">LIVE</p>
          <p className="text-white/50 text-sm mt-1">Waiting for auctioneer video...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative aspect-video">
      <VideoTrack trackRef={videoTrack} className="w-full h-full object-cover" />
      <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 rounded-full px-3 py-1">
        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-white text-xs font-medium">LIVE</span>
      </div>
    </div>
  );
}
