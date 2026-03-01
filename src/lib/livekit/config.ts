import { RoomServiceClient, AccessToken } from 'livekit-server-sdk';

let roomService: RoomServiceClient | null = null;

export function getRoomService(): RoomServiceClient {
  if (!roomService) {
    roomService = new RoomServiceClient(
      process.env.NEXT_PUBLIC_LIVEKIT_URL!.replace('wss://', 'https://'),
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!,
    );
  }
  return roomService;
}

export interface TokenOptions {
  roomName: string;
  participantName: string;
  participantIdentity: string;
  isPublisher?: boolean;
  metadata?: string;
}

/**
 * Generate a LiveKit access token for a participant.
 */
export async function generateToken(options: TokenOptions): Promise<string> {
  const { roomName, participantName, participantIdentity, isPublisher, metadata } = options;

  const token = new AccessToken(
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!,
    {
      identity: participantIdentity,
      name: participantName,
      metadata,
    },
  );

  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: isPublisher ?? false,
    canSubscribe: true,
    canPublishData: true,
  });

  return await token.toJwt();
}

/**
 * Create a LiveKit room for a live auction.
 */
export async function createAuctionRoom(roomName: string) {
  const service = getRoomService();
  return service.createRoom({
    name: roomName,
    emptyTimeout: 300, // 5 min empty before auto-close
    maxParticipants: 1000,
    metadata: JSON.stringify({ type: 'live_auction' }),
  });
}

/**
 * Delete a LiveKit room.
 */
export async function deleteAuctionRoom(roomName: string) {
  const service = getRoomService();
  return service.deleteRoom(roomName);
}
