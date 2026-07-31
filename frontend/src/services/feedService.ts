import api from "./api";

export interface FeedPostItem {
  id: string;
  display_number?: number;
  user_id?: string;
  title?: string | null;
  caption?: string | null;
  likes_count?: number;
  comments_count?: number;
  reposts_count?: number;
  views_count?: number;
  is_liked?: boolean;
  is_bookmarked?: boolean;
  is_reposted?: boolean;
  is_mine?: boolean;
  user?: {
    id?: string;
    username?: string;
    nickname?: string;
    full_name?: string;
    profile_image_url?: string;
    is_admin?: boolean;
    is_following?: boolean;
  };
  media?: any[];
  location?: string | null;
  visibility?: string;
  preview_comments?: any[];
  youtube_url?: string | null;
  youtube_title?: string | null;
  youtube_thumbnail_url?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface StoryGroupItem {
  user_id: string;
  username: string;
  nickname?: string;
  full_name?: string;
  profile_image_url?: string;
  is_self?: boolean;
  has_unseen?: boolean;
  stories?: any[];
}

export const feedService = {
  getFeedPosts: async (): Promise<FeedPostItem[]> => {
    const response = await api.get("/posts/feed");
    if (!response.data) return [];
    return response.data.data || (Array.isArray(response.data) ? response.data : []);
  },

  getStoriesFeed: async (): Promise<StoryGroupItem[]> => {
    const response = await api.get("/stories/feed");
    return response.data?.data || [];
  },

  toggleLike: async (postId: string) => {
    return api.post(`/posts/${postId}/like`);
  },

  deletePost: async (postId: string) => {
    return api.delete(`/posts/${postId}`);
  },
};

export const areFeedPostsEqual = (a: FeedPostItem[], b: FeedPostItem[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const itemA = a[i];
    const itemB = b[i];
    if (
      itemA.id !== itemB.id ||
      itemA.likes_count !== itemB.likes_count ||
      itemA.comments_count !== itemB.comments_count ||
      itemA.is_liked !== itemB.is_liked ||
      itemA.is_bookmarked !== itemB.is_bookmarked ||
      itemA.is_reposted !== itemB.is_reposted ||
      itemA.caption !== itemB.caption ||
      itemA.user?.is_following !== itemB.user?.is_following
    ) {
      return false;
    }
  }
  return true;
};
