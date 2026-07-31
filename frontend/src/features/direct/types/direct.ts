export interface DirectUser {
  id: string;
  username: string;
  nickname?: string | null;
  full_name: string;
  profile_image_url?: string | null;
  is_admin?: boolean;
}

export interface DirectConversation {
  id: string;
  target_user: DirectUser | null;
  created_at: string;
  updated_at: string;
}

export interface DirectMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender?: DirectUser | null;
  content: string;
  created_at: string;
  updated_at: string;
  isOptimistic?: boolean;
}
