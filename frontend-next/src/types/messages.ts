
// types/messages.ts

export type SignalMessageType = 
  | 'HELLO' 
  | 'JOIN_REQUEST' 
  | 'JOIN_ACCEPTED' 
  | 'JOIN_REJECTED'
  | 'OFFER' 
  | 'ANSWER' 
  | 'ICE_CANDIDATE'
  | 'PARTICIPANT_UPDATE'
  | 'MEDIA_STATE_UPDATE'
  | 'LAYOUT_UPDATE'
  | 'AUDIO_LEVELS'
  | 'CHAT_MESSAGE';

export interface BaseSignalMessage {
  type: SignalMessageType;
  id: string;
  timestamp: number;
}

export interface JoinRequestMessage extends BaseSignalMessage {
  type: 'JOIN_REQUEST';
  payload: {
    roomId: string;
    displayName: string;
    role: 'host' | 'guest' | 'viewer';
    sdp?: string; // Initial Offer if aggressive negotiation
  };
}

export interface WebRTCMessage extends BaseSignalMessage {
  type: 'OFFER' | 'ANSWER' | 'ICE_CANDIDATE';
  payload: {
    targetId: string;
    senderId: string;
    sdp?: string;
    candidate?: RTCIceCandidateInit;
  };
}

export interface LayoutUpdateMessage extends BaseSignalMessage {
  type: 'LAYOUT_UPDATE';
  payload: {
    sceneId: string;
    layout: any; // Typed in layout.ts
  };
}

export interface AudioLevelsMessage extends BaseSignalMessage {
  type: 'AUDIO_LEVELS';
  payload: Record<string, number>; // participantId -> normalized volume (0-1)
}

export type SignalMessage = 
  | JoinRequestMessage 
  | WebRTCMessage 
  | LayoutUpdateMessage 
  | AudioLevelsMessage;
