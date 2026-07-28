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
  withdrawal_status?: "pending" | "finalized" | "purged" | null;
  withdrawal_requested_at?: string | null;
  withdrawal_cancelable_until?: string | null;
  withdrawal_finalized_at?: string | null;
  personal_data_retention_until?: string | null;
  personal_data_legal_hold?: boolean;
  personal_data_purged_at?: string | null;
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
  target_id?: string | null; revision_id?: string | null; content_number?: string | null; ip_address?: string | null; snapshot?: Record<string, unknown> | null; created_at: string;
}

export interface AdminContentRevision {
  kind: "post" | "comment";
  revision_id: string;
  target_id: string;
  version: number;
  lifecycle_event: string;
  content_number?: string | null;
  board_label?: string | null;
  title?: string | null;
  caption?: string | null;
  content?: string | null;
  content_type?: string | null;
  location?: string | null;
  visibility?: string | null;
  media?: Array<{ media_url: string; media_type: string; order: number }>;
  post?: {
    id: string;
    content_number?: string | null;
    title?: string | null;
    caption?: string | null;
    board_label?: string | null;
  };
  author: {
    id: string;
    username: string;
    nickname?: string | null;
    profile_image_url?: string | null;
  };
  comments?: Array<{
    id: string;
    content_number?: string | null;
    content_type: string;
    content: string;
    lifecycle_event: string;
    event_ip?: string | null;
    created_at: string;
  }>;
  event_ip?: string | null;
  event_at: string;
  retention_until: string;
  legal_hold: boolean;
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
  getUserContent: async (userId: string, postPage: number = 1, commentPage: number = 1, size: number = 20) =>
    (await api.get(`/admin/users/${userId}/content`, {
      params: { post_page: postPage, comment_page: commentPage, size },
    })).data.data,
  getContentRevision: async (revisionId: string): Promise<AdminContentRevision> =>
    (await api.get(`/admin/content-revisions/${revisionId}`)).data.data,
  setContentRevisionLegalHold: async (revisionId: string, enabled: boolean): Promise<void> => {
    await api.patch(`/admin/content-revisions/${revisionId}/legal-hold`, null, {
      params: { enabled },
    });
  },
};
