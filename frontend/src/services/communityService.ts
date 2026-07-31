import api from "./api";

export interface CommunityBoard {
  id: string;
  name: string;
  slug?: string;
  parent_id?: string | null;
  is_anonymous?: boolean;
  is_default?: boolean;
  sort_order?: number;
}

export interface CommunityNotice {
  id: string;
  title: string;
  content: string;
  created_at: string;
}

export interface CommunityPost {
  id: string;
  user_id: string;
  board_id?: string | null;
  board_type?: string | null;
  board_name?: string | null;
  title?: string | null;
  caption?: string | null;
  likes_count?: number;
  comments_count?: number;
  reposts_count?: number;
  is_liked?: boolean;
  is_bookmarked?: boolean;
  is_reposted?: boolean;
  is_mine?: boolean;
  user?: any;
  media?: any[];
  youtube_url?: string | null;
  youtube_title?: string | null;
  youtube_thumbnail_url?: string | null;
  created_at: string;
  updated_at: string;
}

export const communityService = {
  getBoards: async (): Promise<CommunityBoard[]> => {
    const res = await api.get("/community/boards");
    return res.data?.data || [];
  },

  getPosts: async (
    targetBoardId: string,
    parentBoardId: string | null,
    isAllChildren: boolean,
    signal?: AbortSignal
  ) => {
    const url = isAllChildren
      ? `/posts/community?parent_board_id=${parentBoardId}`
      : `/posts/community?board_id=${targetBoardId}`;
    const res = await api.get(url, { signal });
    return {
      data: (res.data?.data || []) as CommunityPost[],
      meta: res.data?.meta || {},
    };
  },

  getGlobalNotices: async (signal?: AbortSignal): Promise<CommunityNotice[]> => {
    const res = await api.get("/community/notices?notice_type=global", { signal });
    return res.data?.data || [];
  },

  getAllNotices: async (): Promise<any[]> => {
    const res = await api.get("/community/notices?notice_type=all");
    return res.data?.data || [];
  },

  deletePost: async (postId: string) => {
    return api.delete(`/posts/${postId}`);
  },

  toggleLike: async (postId: string) => {
    return api.post(`/posts/${postId}/like`);
  },
};
