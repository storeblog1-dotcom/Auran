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
