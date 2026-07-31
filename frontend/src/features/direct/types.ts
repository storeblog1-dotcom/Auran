export type DirectRequestStatus = "ACCEPTED" | "PENDING" | "REJECTED" | "NEW";

export type DirectMessageKind = "TEXT" | "IMAGE" | "POST";

export type DirectDeliveryState =
  | "pending"
  | "failed"
  | "sent"
  | "delivered"
  | "read";

export interface DirectUser {
  id: string;
  username: string;
  nickname?: string | null;
  full_name?: string | null;
  profile_image_url?: string | null;
  is_admin?: boolean;
  is_online?: boolean;
  last_seen_at?: string | null;
}

export interface DirectMessage {
  id: string;
  room_id: string;
  sender: DirectUser;
  content: string | null;
  message_type: DirectMessageKind;
  media_url: string | null;
  shared_post_id: string | null;
  created_at: string;
  client_message_id?: string | null;
  delivered_at?: string | null;
  read_at?: string | null;
  delivery_status?: DirectDeliveryState | null;
  local_status: DirectDeliveryState;
  error_message?: string | null;
}

export interface DirectRoom {
  id: string;
  is_group: boolean;
  name: string | null;
  target_user: DirectUser | null;
  members: DirectUser[];
  last_message: DirectMessage | null;
  unread_count: number;
  request_status: DirectRequestStatus;
  is_outgoing_request: boolean;
  request_message_count: number;
  request_message_limit: number;
  can_send_message: boolean;
  can_share_post: boolean;
  message_permission_reason: string | null;
  updated_at: string;
}

export interface CreateDirectMessage {
  content?: string | null;
  message_type: DirectMessageKind;
  media_url?: string | null;
  shared_post_id?: string | null;
  client_message_id: string;
}

export type DirectConnectionState =
  | "connecting"
  | "online"
  | "reconnecting"
  | "offline";

export type DirectRealtimeEvent =
  | {
      type: "message.created" | "message.updated";
      room_id: string;
      message: DirectMessage;
    }
  | {
      type: "message.read";
      room_id: string;
      user_id: string;
      message_ids?: string[];
      read_at: string;
    }
  | {
      type: "message.delivered";
      room_id: string;
      user_id: string;
      message_ids?: string[];
      delivered_at: string;
    }
  | {
      type: "typing";
      room_id: string;
      user_id: string;
      is_typing: boolean;
    }
  | {
      type: "presence";
      room_id: string;
      user_id: string;
      is_online: boolean;
      last_seen_at?: string | null;
    };

export interface DirectRealtimeSubscription {
  close: () => void;
  setTyping: (isTyping: boolean) => void;
  setPresence: (isOnline: boolean) => void;
}

export interface DirectRealtimeCallbacks {
  onEvent: (event: DirectRealtimeEvent) => void;
  onConnectionChange: (state: DirectConnectionState) => void;
}

export interface DirectRealtimeTransport {
  subscribe: (
    roomId: string,
    userId: string,
    callbacks: DirectRealtimeCallbacks
  ) => Promise<DirectRealtimeSubscription>;
}

export interface MessageDateItem {
  type: "date";
  id: string;
  date: Date;
}

export interface MessageContentItem {
  type: "message";
  id: string;
  message: DirectMessage;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
}

export type DirectTimelineItem = MessageDateItem | MessageContentItem;
