import api from "./api";

export interface AdminStats {
  total_users: number;
  active_users: number;
  total_posts: number;
  total_comments: number;
  total_stories: number;
}

export interface AdminUserItem {
  id: string;
  username: string;
  nickname?: string | null;
  email: string;
  full_name: string;
  profile_image_url?: string;
  is_active: boolean;
  is_admin: boolean;
  created_at?: string;
}

export interface AdminPostItem {
  id: string;
  content_number?: string | null;
  caption?: string;
  media?: Array<{
    media_url?: string;
    url?: string;
    image_url?: string;
  }>;
  author: {
    id: string;
    username: string;
    nickname?: string | null;
  };
  created_at?: string;
}

export interface AdminActivityLog {
  id: string; user_id?: string | null; username?: string; nickname?: string | null; event_type: string; target_type?: string | null;
  target_id?: string | null; content_number?: string | null; ip_address?: string | null; snapshot?: Record<string, unknown> | null; created_at: string;
}

export const adminService = {
  getStats: async (): Promise<AdminStats> => {
    const res = await api.get("/admin/stats");
    return res.data.data;
  },

  getUsers: async (q?: string, page: number = 1, size: number = 20) => {
    const params: any = { page, size };
    if (q && q.trim()) {
      params.q = q.trim();
    }
    const res = await api.get("/admin/users", { params });
    return {
      items: res.data.data as AdminUserItem[],
      total: res.data.pagination?.total || res.data.total || res.data.data.length,
    };
  },

  toggleUserActive: async (userId: string): Promise<AdminUserItem> => {
    const res = await api.patch(`/admin/users/${userId}/toggle-active`);
    return res.data.data;
  },

  getPosts: async (page: number = 1, size: number = 20) => {
    const res = await api.get("/admin/posts", { params: { page, size } });
    return {
      items: res.data.data as AdminPostItem[],
      total: res.data.pagination?.total || res.data.total || res.data.data.length,
    };
  },

  deletePost: async (postId: string): Promise<void> => {
    await api.delete(`/admin/posts/${postId}`);
  },
  getActivityLogs: async (q?: string, page: number = 1, size: number = 20) => {
    const res = await api.get("/admin/activity-logs", { params: { q, page, size } });
    return { items: res.data.data as AdminActivityLog[], total: res.data.pagination?.total || 0 };
  },
  getUserContent: async (userId: string) => (await api.get(`/admin/users/${userId}/content`)).data.data,
};
