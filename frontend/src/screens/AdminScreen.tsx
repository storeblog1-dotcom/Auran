import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Image,
  ScrollView,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import {
  adminService,
  AdminStats,
  AdminUserItem,
  AdminPostItem,
  AdminActivityUser,
  AdminContentHistoryItem,
  AdminReportGroup,
  AdminReportDetail,
} from "../services/adminService";
import { getFullImageUrl } from "../config";
import {
  PostDetailModal,
  AdminPostAuditContext,
} from "../components/PostDetailModal";
import { AdminUserActivityModal } from "../components/AdminUserActivityModal";
import { AdminContentRevisionModal } from "../components/AdminContentRevisionModal";
import { getDisplayName } from "../utils/displayName";
import { AdminAvatar, AdminBadge } from "../components/AdminIdentity";
import { AdminCommunitySection } from "../components/admin/AdminCommunitySection";
import { AdminStatsSection } from "../components/admin/AdminStatsSection";
import { AdminReportDetailModal } from "../components/admin/AdminReportDetailModal";
import { AdminPostSection } from "../components/admin/AdminPostSection";
import { AdminUserSection } from "../components/admin/AdminUserSection";
import { AdminReportSection } from "../components/admin/AdminReportSection";

type AdminTab = "stats" | "users" | "posts" | "activity" | "reports" | "community";

const getReportedPostImages = (snapshot: Record<string, any> | null | undefined) => {
  const media = Array.isArray(snapshot?.media) ? snapshot.media : [];
  return media.map((item: any) => ({ url: item?.url || item?.media_url || item?.image_url || null, type: String(item?.type || item?.media_type || "image").toLowerCase() })).filter((item: { url: string | null; type: string }) => item.url && item.type === "image");
};

export const AdminScreen = ({ navigation }: any) => {
  const { colors, isDark } = useTheme();
  const [activeTab, setActiveTab] = useState<AdminTab>("stats");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Stats State
  const [stats, setStats] = useState<AdminStats | null>(null);

  // Users State
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [userPage, setUserPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [selectedUserForModal, setSelectedUserForModal] = useState<AdminUserItem | null>(null);
  const [userPostsModalVisible, setUserPostsModalVisible] = useState(false);

  // Posts State
  const [posts, setPosts] = useState<AdminPostItem[]>([]);
  const [postPage, setPostPage] = useState(1);
  const [totalPosts, setTotalPosts] = useState(0);
  const [contentScope, setContentScope] = useState<"feed" | "community">("feed");
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [selectedPostBoardLabel, setSelectedPostBoardLabel] = useState<string | null>(null);
  const [selectedPostAuditContext, setSelectedPostAuditContext] =
    useState<AdminPostAuditContext | null>(null);
  const [postDetailModalVisible, setPostDetailModalVisible] = useState(false);
  const [managedPost, setManagedPost] = useState<AdminPostItem | null>(null);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [revisionModalVisible, setRevisionModalVisible] = useState(false);
  const [activityUsers, setActivityUsers] = useState<AdminActivityUser[]>([]);
  const [activityPage, setActivityPage] = useState(1);
  const [totalActivityUsers, setTotalActivityUsers] = useState(0);
  const [activityLoadingMore, setActivityLoadingMore] = useState(false);
  const [expandedActivityUserId, setExpandedActivityUserId] = useState<string | null>(null);
  const [activityQuery, setActivityQuery] = useState("");
  const [activityContent, setActivityContent] = useState<any>(null);
  const [activityContentLoading, setActivityContentLoading] = useState(false);
  const activityContentCache = useRef<Map<string, any>>(new Map());
  const activityRequestId = useRef(0);
  const [expandedHistoryKey, setExpandedHistoryKey] = useState<string | null>(null);
  const [activityHistory, setActivityHistory] = useState<AdminContentHistoryItem[]>([]);
  const [activityHistoryLoading, setActivityHistoryLoading] = useState(false);
  const activityHistoryCache = useRef<Map<string, AdminContentHistoryItem[]>>(new Map());
  const [reports, setReports] = useState<AdminReportGroup[]>([]);
  const [reportStatus, setReportStatus] = useState("");
  const [selectedReport, setSelectedReport] = useState<AdminReportDetail | null>(null);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportNote, setReportNote] = useState("");

  const isMemberSection = activeTab === "users" || activeTab === "activity";
  const isContentSection = activeTab === "posts" || activeTab === "reports";

  const loadStats = async () => {
    try {
      const data = await adminService.getStats();
      setStats(data);
    } catch (err: any) {
      console.log("Failed to fetch admin stats", err);
      Alert.alert("오류", "통계 데이터를 불러오는데 실패했습니다.");
    }
  };

  const loadUsers = async (query: string = searchQuery, page: number = 1) => {
    try {
      setLoading(true);
      const res = await adminService.getUsers(query, page, 20);
      setUsers(res.items);
      setTotalUsers(res.total);
      setUserPage(page);
    } catch (err: any) {
      console.log("Failed to fetch admin users", err);
      Alert.alert("오류", "사용자 목록을 불러오는데 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const loadPosts = async (page: number = 1, scope: "feed" | "community" = contentScope) => {
    try {
      setLoading(true);
      const res = await adminService.getPosts(page, 48, scope);
      setPosts(res.items);
      setTotalPosts(res.total);
      setPostPage(page);
    } catch (err: any) {
      console.log("Failed to fetch admin posts", err);
      Alert.alert("오류", "게시물 목록을 불러오는데 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };
  const loadReports = async () => {
    try {
      setLoading(true);
      const result = await adminService.getReports(reportStatus || undefined);
      setReports(result.items);
    } catch {
      Alert.alert("오류", "신고 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };
  const openReport = async (item: AdminReportGroup) => {
    try {
      const detail = await adminService.getReportDetail(item.target_type, item.target_id);
      setSelectedReport({ ...item, ...detail });
      setReportNote("");
      setReportModalVisible(true);
    } catch {
      Alert.alert("오류", "신고 상세를 불러오지 못했습니다.");
    }
  };
  const moderateReport = async (
    status: "reviewing" | "resolved" | "rejected",
    action: "maintain" | "hide" | "delete" | "warn" | "suspend",
  ) => {
    if (!selectedReport) return;
    try {
      await adminService.moderateReport(
        selectedReport.target_type,
        selectedReport.target_id,
        status,
        action,
        reportNote,
      );
      setReportModalVisible(false);
      setSelectedReport(null);
      await loadReports();
    } catch {
      Alert.alert("오류", "신고 처리 저장에 실패했습니다.");
    }
  };
  const loadActivity = async (
    q: string = activityQuery,
    page: number = 1,
    append: boolean = false,
  ) => {
    try {
      append ? setActivityLoadingMore(true) : setLoading(true);
      if (!append) {
        activityContentCache.current.clear();
        activityHistoryCache.current.clear();
        setActivityContent(null);
        setExpandedActivityUserId(null);
        setExpandedHistoryKey(null);
      }
      const res = await adminService.getActivityUsers(q, page);
      setActivityUsers((previous) => append ? [...previous, ...res.items] : res.items);
      setActivityPage(page);
      setTotalActivityUsers(res.total);
    }
    catch { Alert.alert("오류", "활동 로그를 불러오는데 실패했습니다."); }
    finally {
      setLoading(false);
      setActivityLoadingMore(false);
    }
  };

  const toggleActivityUser = async (item: AdminActivityUser) => {
    const opening = expandedActivityUserId !== item.user_id;
    setExpandedActivityUserId(opening ? item.user_id : null);
    setExpandedHistoryKey(null);
    setActivityHistory([]);
    if (!opening) {
      activityRequestId.current += 1;
      setActivityContentLoading(false);
      setActivityContent(null);
      return;
    }
    const cached = activityContentCache.current.get(item.user_id);
    if (cached) {
      setActivityContent(cached);
      return;
    }
    const requestId = ++activityRequestId.current;
    setActivityContent(null);
    setActivityContentLoading(true);
    try {
      const content = await adminService.getUserContent(item.user_id);
      activityContentCache.current.set(item.user_id, content);
      if (requestId === activityRequestId.current) setActivityContent(content);
    } catch {
      Alert.alert("오류", "사용자 콘텐츠를 불러오는데 실패했습니다.");
    } finally {
      if (requestId === activityRequestId.current) setActivityContentLoading(false);
    }
  };

  const openActivityContent = (
    item: any,
    contentType: "post" | "comment",
  ) => {
    if (item.revision_id || item.deleted) {
      if (!item.revision_id) {
        Alert.alert("알림", "보존된 상세 버전을 찾을 수 없습니다.");
        return;
      }
      setSelectedRevisionId(item.revision_id);
      setRevisionModalVisible(true);
      return;
    }
    const postId = contentType === "post" ? item.id : item.post_id;
    if (!postId) {
      Alert.alert("알림", "연결된 원 게시물을 찾을 수 없습니다.");
      return;
    }
    setSelectedPostId(postId);
    setSelectedPostBoardLabel(item.board_label || null);
    setSelectedPostAuditContext({
      contentNumber: item.content_number,
      contentType: item.content_type,
      eventType: item.latest_event_type,
      eventIp: item.latest_event_ip,
      eventAt: item.latest_event_at,
    });
    setPostDetailModalVisible(true);
  };

  const toggleContentHistory = async (
    contentType: "post" | "comment",
    contentId: string,
  ) => {
    const key = `${contentType}:${contentId}`;
    if (expandedHistoryKey === key) {
      setExpandedHistoryKey(null);
      setActivityHistory([]);
      return;
    }
    setExpandedHistoryKey(key);
    const cached = activityHistoryCache.current.get(key);
    if (cached) {
      setActivityHistory(cached);
      return;
    }
    setActivityHistory([]);
    setActivityHistoryLoading(true);
    try {
      const history = await adminService.getContentHistory(contentType, contentId);
      activityHistoryCache.current.set(key, history);
      setActivityHistory(history);
    } catch {
      setExpandedHistoryKey(null);
      Alert.alert("오류", "콘텐츠 변경 이력을 불러오지 못했습니다.");
    } finally {
      setActivityHistoryLoading(false);
    }
  };

  const loadMoreActivityContent = async (userId: string) => {
    if (!activityContent || activityContentLoading) return;
    setActivityContentLoading(true);
    try {
      const pagination = activityContent.pagination;
      const next = await adminService.getUserContent(
        userId,
        (pagination?.post_page || 1) + 1,
        (pagination?.comment_page || 1) + 1,
      );
      const merged = {
        ...next,
        posts: [...(activityContent.posts || []), ...(next.posts || [])],
        comments: [...(activityContent.comments || []), ...(next.comments || [])],
      };
      activityContentCache.current.set(userId, merged);
      setActivityContent(merged);
    } catch {
      Alert.alert("오류", "추가 콘텐츠를 불러오는데 실패했습니다.");
    } finally {
      setActivityContentLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    if (activeTab === "stats") {
      await loadStats();
    } else if (activeTab === "users") {
      await loadUsers(searchQuery, 1);
    } else if (activeTab === "posts") {
      await loadPosts(1, contentScope);
    } else if (activeTab === "reports") {
      await loadReports();
    } else if (activeTab === "activity") { await loadActivity(activityQuery, 1);
    }
    setRefreshing(false);
  };

  useEffect(() => {
    if (activeTab === "stats") {
      loadStats();
    } else if (activeTab === "users") {
      loadUsers(searchQuery, 1);
    } else if (activeTab === "posts") {
      loadPosts(1, contentScope);
    } else if (activeTab === "reports") {
      loadReports();
    } else if (activeTab === "activity") { loadActivity(activityQuery, 1);
    }
  }, [activeTab]);

  const handleToggleUserActive = async (targetUser: AdminUserItem) => {
    const actionText = targetUser.is_active ? "정지" : "활성화";
    Alert.alert(
      `계정 ${actionText}`,
      `'@${targetUser.username}' 계정을 정말 ${actionText}하시겠습니까?`,
      [
        { text: "취소", style: "cancel" },
        {
          text: actionText,
          style: targetUser.is_active ? "destructive" : "default",
          onPress: async () => {
            try {
              const updated = await adminService.toggleUserActive(targetUser.id);
              setUsers((prev) =>
                prev.map((u) => (u.id === updated.id ? { ...u, is_active: updated.is_active } : u))
              );
              Alert.alert("성공", `@${targetUser.username} 계정이 ${actionText}되었습니다.`);
            } catch (err: any) {
              const msg = err.response?.data?.detail || "상태 변경에 실패했습니다.";
              Alert.alert("오류", msg);
            }
          },
        },
      ]
    );
  };

  const handleDeletePost = async (targetPost: AdminPostItem) => {
    Alert.alert("게시물 삭제", "해당 게시물을 정말로 강제 삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "강제 삭제",
        style: "destructive",
        onPress: async () => {
          try {
            await adminService.deletePost(targetPost.id);
            setPosts((prev) => prev.filter((p) => p.id !== targetPost.id));
            setTotalPosts((prev) => Math.max(0, prev - 1));
            Alert.alert("성공", "게시물이 강제 삭제되었습니다.");
          } catch (err: any) {
            Alert.alert("오류", "게시물 삭제에 실패했습니다.");
          }
        },
      },
    ]);
  };

  const handleSetPostHidden = (targetPost: AdminPostItem, hidden: boolean) => {
    const actionLabel = hidden ? "숨김" : "숨김 해제";
    Alert.alert(
      `게시물 ${actionLabel}`,
      hidden ? "이 게시물은 일반 사용자에게 보이지 않게 됩니다." : "이 게시물을 다시 일반 사용자에게 표시합니다.",
      [
        { text: "취소", style: "cancel" },
        {
          text: actionLabel,
          style: hidden ? "destructive" : "default",
          onPress: async () => {
            try {
              const updated = await adminService.setPostModerationHidden(targetPost.id, hidden);
              setPosts((prev) => prev.map((post) => (
                post.id === updated.post_id ? { ...post, moderation_hidden: updated.moderation_hidden } : post
              )));
              Alert.alert("완료", `게시물이 ${actionLabel} 처리되었습니다.`);
            } catch (err: any) {
              Alert.alert("오류", err.response?.data?.detail || `게시물 ${actionLabel} 처리에 실패했습니다.`);
            }
          },
        },
      ],
    );
  };

  const openPostManagementMenu = (item: AdminPostItem) => {
    setManagedPost(item);
  };

  const primaryAccent = isDark ? "#a855f7" : "#7c3aed";
  const cyanBorder = isDark ? "#06b6d4" : "#0284c7";

  const renderContentHistory = (historyKey: string) => {
    if (expandedHistoryKey !== historyKey) return null;
    return (
      <View style={[styles.historyPanel, { borderColor: colors.borderColor }]}>
        {activityHistoryLoading ? (
          <ActivityIndicator style={{ marginVertical: 8 }} color={primaryAccent} />
        ) : activityHistory.length === 0 ? (
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>보존된 변경 이력이 없습니다.</Text>
        ) : activityHistory.map((history) => (
          <TouchableOpacity
            key={history.revision_id}
            activeOpacity={0.75}
            onPress={(event) => {
              event.stopPropagation();
              setSelectedRevisionId(history.revision_id);
              setRevisionModalVisible(true);
            }}
            style={[styles.historyRow, { borderBottomColor: colors.borderColor }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: primaryAccent, fontWeight: "700", fontSize: 12 }}>
                버전 {history.version} · {history.lifecycle_event}
              </Text>
              <Text numberOfLines={2} style={{ color: colors.textPrimary, marginTop: 3, fontSize: 12 }}>
                {history.display_text || "(내용 없음)"}
              </Text>
              <Text style={{ color: colors.textMuted, marginTop: 3, fontSize: 11 }}>
                {new Date(history.event_at).toLocaleString()} · IP {history.event_ip || "기록 없음"}
              </Text>
            </View>
            <Text style={{ color: primaryAccent, fontSize: 11, fontWeight: "700" }}>상세 보기</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderActivityContentRow = (
    content: any,
    contentType: "post" | "comment",
  ) => {
    const historyKey = `${contentType}:${content.id}`;
    const mediaUrl =
      content.media?.[0]?.media_url ||
      content.media?.[0]?.url ||
      content.media_manifest?.[0]?.media_url ||
      content.image_url ||
      content.url ||
      null;
    const dateText = content.latest_event_at || content.created_at;
    const formattedDate = dateText
      ? new Date(dateText).toLocaleString("ko-KR", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "시간 기록 없음";

    return (
      <View key={historyKey}>
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={(event) => {
            event.stopPropagation();
            openActivityContent(content, contentType);
          }}
          style={[styles.activityContentRow, { borderColor: colors.borderColor }]}
        >
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <Text style={{ color: primaryAccent, fontWeight: "700", fontSize: 12 }}>
                [{content.content_type || (contentType === "post" ? "게시물" : "댓글")}] [{content.board_label || "피드"}] {content.content_number || ""}
              </Text>
            </View>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
              <View style={{ flex: 1 }}>
                {contentType === "post" && !!content.title && (
                  <Text style={{ color: colors.textPrimary, fontWeight: "bold", fontSize: 13, marginBottom: 2 }} numberOfLines={1}>
                    {content.title}
                  </Text>
                )}
                <Text
                  numberOfLines={3}
                  style={{ color: colors.textPrimary, fontSize: 12, lineHeight: 17 }}
                >
                  {content.content || content.display_text || content.caption || "(내용 없음)"}
                </Text>
              </View>

              {!!mediaUrl && (
                <Image
                  source={{ uri: getFullImageUrl(mediaUrl) }}
                  style={{ width: 56, height: 56, borderRadius: 8 }}
                  resizeMode="cover"
                />
              )}
            </View>

            <Text style={{ color: colors.textMuted, marginTop: 6, fontSize: 11 }}>
              최근 행위: {content.latest_event_type || "기록 없음"} · IP {content.latest_event_ip || "기록 없음"} · {formattedDate}
            </Text>

            <TouchableOpacity
              onPress={(event) => {
                event.stopPropagation();
                toggleContentHistory(contentType, content.id);
              }}
              style={styles.historyButton}
            >
              <Ionicons name="time-outline" size={14} color={primaryAccent} />
              <Text style={{ color: primaryAccent, fontSize: 12, fontWeight: "700" }}>
                변경 이력 {content.revision_count || 0}건
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.detailLabel}>
            <Text style={{ color: primaryAccent, fontSize: 11, fontWeight: "700" }}>상세 보기</Text>
            <Ionicons name="chevron-forward" size={15} color={primaryAccent} />
          </View>
        </TouchableOpacity>
        {renderContentHistory(historyKey)}
      </View>
    );
  };

  const renderActivityUser = ({ item }: { item: AdminActivityUser }) => {
    const isExpanded = expandedActivityUserId === item.user_id;
    const hasMore = activityContent?.pagination?.posts_has_more || activityContent?.pagination?.comments_has_more;
    const withdrawalLabel =
      item.withdrawal_status === "pending"
        ? "탈퇴 대기"
        : item.withdrawal_status === "finalized"
        ? "최종 탈퇴"
        : item.withdrawal_status === "purged"
        ? "개인정보 파기"
        : "가입 회원";
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => toggleActivityUser(item)}
        style={[styles.activityLogCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}
      >
        <View style={styles.activityUserHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.usernameText, { color: colors.textPrimary }]}>
              {item.username} {item.nickname ? `(${item.nickname})` : ""}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }}>
              최근 활동 {new Date(item.latest_activity_at).toLocaleString()} · 총 {item.activity_count}건
            </Text>
            <Text style={{ color: item.withdrawal_status ? "#ef4444" : "#16a34a", fontSize: 11, marginTop: 3 }}>
                {withdrawalLabel}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                setSelectedUserForModal({
                  id: item.user_id,
                  username: item.username,
                  nickname: item.nickname,
                  full_name: item.nickname || item.username,
                  email: "",
                  is_active: true,
                  is_admin: false,
                });
                setUserPostsModalVisible(true);
              }}
              style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: `${primaryAccent}18` }}
            >
              <Text style={{ color: primaryAccent, fontSize: 11, fontWeight: "bold" }}>360° 모달</Text>
            </TouchableOpacity>

            <View style={styles.detailLabel}>
              <Text style={{ color: primaryAccent, fontSize: 11, fontWeight: "700" }}>
                {isExpanded ? "접기" : "콘텐츠 보기"}
              </Text>
              <Ionicons
                name={isExpanded ? "chevron-up" : "chevron-down"}
                size={16}
                color={primaryAccent}
              />
            </View>
          </View>
        </View>
        {isExpanded && (
          <View style={[styles.activityDetail, { borderTopColor: colors.borderColor }]}>
            {activityContentLoading && !activityContent && (
              <ActivityIndicator style={{ marginVertical: 14 }} color={primaryAccent} />
            )}
            {!!activityContent?.account_events?.length && (
              <View style={[styles.accountEvents, { borderColor: colors.borderColor }]}>
                <Text style={{ color: colors.textPrimary, fontWeight: "800", fontSize: 12 }}>
                  가입·탈퇴 기록
                </Text>
                {activityContent.account_events.map((event: any) => (
                  <View key={event.id} style={styles.accountEventRow}>
                    <Text style={{ color: primaryAccent, fontWeight: "700", fontSize: 12 }}>
                      {event.event_type}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                      {new Date(event.created_at).toLocaleString()} · IP {event.ip_address || "기록 없음"}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            {activityContent?.posts?.map((post: any) =>
              renderActivityContentRow(post, "post")
            )}
            {activityContent?.comments?.map((comment: any) =>
              renderActivityContentRow(comment, "comment")
            )}
            {activityContent &&
              !activityContent.posts?.length &&
              !activityContent.comments?.length && (
                <Text style={{ color: colors.textMuted, textAlign: "center", marginVertical: 14 }}>
                  작성한 콘텐츠가 없습니다.
                </Text>
              )}
            {activityContent && hasMore && (
              <TouchableOpacity
                disabled={activityContentLoading}
                onPress={(event) => {
                  event.stopPropagation();
                  loadMoreActivityContent(item.user_id);
                }}
                style={[styles.loadMoreButton, { borderColor: primaryAccent }]}
              >
                {activityContentLoading
                  ? <ActivityIndicator size="small" color={primaryAccent} />
                  : <Text style={{ color: primaryAccent, fontWeight: "700" }}>더 보기</Text>}
              </TouchableOpacity>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      {/* Header Bar */}
      <View style={[styles.header, { borderBottomColor: colors.borderColor }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>🛡️ 관리자 대시보드</Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={handleRefresh} activeOpacity={0.7}>
          <Ionicons name="refresh" size={20} color={primaryAccent} />
        </TouchableOpacity>
      </View>

      {/* Segmented Tab Bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.borderColor }} contentContainerStyle={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === "stats" && { borderBottomColor: primaryAccent, borderBottomWidth: 3 }]}
          onPress={() => setActiveTab("stats")}
        >
          <Ionicons name="stats-chart" size={16} color={activeTab === "stats" ? primaryAccent : colors.textMuted} />
          <Text style={[styles.tabText, { color: activeTab === "stats" ? primaryAccent : colors.textMuted, fontWeight: activeTab === "stats" ? "bold" : "500" }]}>
            종합 현황
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, isMemberSection && { borderBottomColor: primaryAccent, borderBottomWidth: 3 }]}
          onPress={() => setActiveTab("users")}
        >
          <Ionicons name="people" size={16} color={isMemberSection ? primaryAccent : colors.textMuted} />
          <Text style={[styles.tabText, { color: isMemberSection ? primaryAccent : colors.textMuted, fontWeight: isMemberSection ? "bold" : "500" }]}>
            회원 관리
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, isContentSection && { borderBottomColor: primaryAccent, borderBottomWidth: 3 }]}
          onPress={() => setActiveTab("posts")}
        >
          <Ionicons name="folder-open-outline" size={16} color={isContentSection ? primaryAccent : colors.textMuted} />
          <Text style={[styles.tabText, { color: isContentSection ? primaryAccent : colors.textMuted, fontWeight: isContentSection ? "bold" : "500" }]}>
            콘텐츠 관리
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === "community" && { borderBottomColor: primaryAccent, borderBottomWidth: 3 }]}
          onPress={() => setActiveTab("community")}
        >
          <Ionicons name="list-outline" size={16} color={activeTab === "community" ? primaryAccent : colors.textMuted} />
          <Text style={[styles.tabText, { color: activeTab === "community" ? primaryAccent : colors.textMuted, fontWeight: activeTab === "community" ? "bold" : "500" }]}>커뮤니티</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Main Content Area */}
      {activeTab === "stats" && (
        <AdminStatsSection
          stats={stats}
          refreshing={refreshing}
          colors={colors}
          primaryAccent={primaryAccent}
          onRefresh={handleRefresh}
        />
      )}

      {activeTab === "users" && (
        <AdminUserSection
          users={users}
          searchQuery={searchQuery}
          totalUsers={totalUsers}
          loading={loading}
          refreshing={refreshing}
          colors={colors}
          primaryAccent={primaryAccent}
          onChangeSearchQuery={(text) => {
            setSearchQuery(text);
            loadUsers(text, 1);
          }}
          onClearSearchQuery={() => {
            setSearchQuery("");
            loadUsers("", 1);
          }}
          onSelectActivityTab={() => setActiveTab("activity")}
          onRefresh={handleRefresh}
          onSelectUser={(item) => {
            setSelectedUserForModal(item);
            setUserPostsModalVisible(true);
          }}
          onToggleUserActive={handleToggleUserActive}
        />
      )}

      {activeTab === "posts" && (
        <AdminPostSection
          posts={posts}
          contentScope={contentScope}
          totalPosts={totalPosts}
          loading={loading}
          refreshing={refreshing}
          colors={colors}
          primaryAccent={primaryAccent}
          onChangeScope={(scope) => {
            setContentScope(scope);
            loadPosts(1, scope);
          }}
          onSelectReportsTab={() => setActiveTab("reports")}
          onRefresh={handleRefresh}
          onSelectPost={(post) => {
            setSelectedPostId(post.id);
            setPostDetailModalVisible(true);
          }}
          onOpenManagementMenu={openPostManagementMenu}
          onDeletePost={handleDeletePost}
        />
      )}

      {activeTab === "reports" && (
        <AdminReportSection
          reports={reports}
          reportStatus={reportStatus}
          loading={loading}
          refreshing={refreshing}
          colors={colors}
          primaryAccent={primaryAccent}
          onChangeReportStatus={(value) => {
            setReportStatus(value);
            setTimeout(() => adminService.getReports(value || undefined).then((result) => setReports(result.items)), 0);
          }}
          onSelectFeedScope={() => {
            setContentScope("feed");
            setActiveTab("posts");
          }}
          onSelectCommunityScope={() => {
            setContentScope("community");
            setActiveTab("posts");
          }}
          onRefresh={handleRefresh}
          onSelectReport={openReport}
        />
      )}

      {activeTab === "activity" && (
        <View style={{ flex: 1, padding: 16 }}>
          <View style={styles.subnavRow}>
            <TouchableOpacity onPress={() => setActiveTab("users")} style={[styles.subnavButton, { borderColor: colors.borderColor }]}><Text style={{ color: colors.textSecondary, fontWeight: "700" }}>회원 목록</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setActiveTab("activity")} style={[styles.subnavButton, { borderColor: primaryAccent, backgroundColor: `${primaryAccent}18` }]}><Text style={{ color: primaryAccent, fontWeight: "700" }}>활동·보존 이력</Text></TouchableOpacity>
          </View>
          <View style={styles.activitySearchRow}>
            <View style={[styles.searchContainer, styles.activitySearchContainer, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
              <Ionicons name="search" size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
              <TextInput value={activityQuery} onChangeText={setActivityQuery} placeholder="아이디 또는 닉네임 검색" placeholderTextColor={colors.textMuted} style={[styles.searchInput, { color: colors.textPrimary }]} />
            </View>
            <TouchableOpacity onPress={() => loadActivity(activityQuery)} style={[styles.activitySearchButton, { backgroundColor: primaryAccent }]}>
              <Text style={{ color: "white", fontWeight: "bold" }}>검색</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={activityUsers}
            keyExtractor={(item) => item.user_id}
            contentContainerStyle={{ paddingTop: 12 }}
            ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 24 }}>표시할 사용자 활동 기록이 없습니다.</Text>}
            ListFooterComponent={
              activityLoadingMore
                ? <ActivityIndicator style={{ marginVertical: 14 }} color={primaryAccent} />
                : null
            }
            onEndReachedThreshold={0.35}
            onEndReached={() => {
              if (!activityLoadingMore && activityUsers.length < totalActivityUsers) {
                loadActivity(activityQuery, activityPage + 1, true);
              }
            }}
            renderItem={renderActivityUser}
          />
        </View>
      )}



      {activeTab === "community" && (
        <AdminCommunitySection
          colors={colors}
          primaryAccent={primaryAccent}
          onCreateBoard={() => navigation.navigate("CommunityAdmin", { mode: "create" })}
          onManageBoards={() => navigation.navigate("CommunityAdmin", { mode: "edit" })}
          onManageNotices={() => navigation.navigate("CommunityAdminNotice")}
        />
      )}

      {/* 회원 360° 통합 활동 모달 (제시안 1 구현) */}
      <AdminUserActivityModal
        visible={userPostsModalVisible}
        user={selectedUserForModal}
        onClose={() => {
          setUserPostsModalVisible(false);
          setSelectedUserForModal(null);
        }}
        onUserUpdated={() => loadUsers(searchQuery, userPage)}
        onOpenPost={(postId, boardLabel, auditContext) => {
          setUserPostsModalVisible(false);
          setSelectedPostId(postId);
          setSelectedPostBoardLabel(boardLabel || null);
          setSelectedPostAuditContext(auditContext || null);
          setPostDetailModalVisible(true);
        }}
        onOpenRevision={(revisionId) => {
          setUserPostsModalVisible(false);
          setSelectedRevisionId(revisionId);
          setRevisionModalVisible(true);
        }}
      />

      {/* 게시물 상세 팝업 모달 */}
      <Modal
        transparent
        visible={Boolean(managedPost)}
        animationType="fade"
        onRequestClose={() => setManagedPost(null)}
      >
        <View style={styles.managementMenuOverlay}>
          <TouchableOpacity
            activeOpacity={1}
            style={StyleSheet.absoluteFill}
            onPress={() => setManagedPost(null)}
          />
          {managedPost && (
            <View style={[styles.managementMenuCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 12 }}>
                {managedPost.title || managedPost.caption || "제목 없음"}
              </Text>
              <TouchableOpacity
                style={styles.managementMenuAction}
                onPress={() => {
                  const targetPost = managedPost;
                  setManagedPost(null);
                  setSelectedPostId(targetPost.id);
                  setSelectedPostBoardLabel(targetPost.board_name || targetPost.board_type || null);
                  setPostDetailModalVisible(true);
                }}
              >
                <Ionicons name="open-outline" size={18} color={primaryAccent} />
                <Text style={[styles.managementMenuText, { color: colors.textPrimary }]}>상세 보기</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.managementMenuAction}
                onPress={() => {
                  const targetPost = managedPost;
                  setManagedPost(null);
                  handleSetPostHidden(targetPost, !targetPost.moderation_hidden);
                }}
              >
                <Ionicons name={managedPost.moderation_hidden ? "eye-outline" : "eye-off-outline"} size={18} color={colors.textPrimary} />
                <Text style={[styles.managementMenuText, { color: colors.textPrimary }]}>{managedPost.moderation_hidden ? "숨김 해제" : "숨김"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.managementMenuAction}
                onPress={() => {
                  const targetPost = managedPost;
                  setManagedPost(null);
                  handleDeletePost(targetPost);
                }}
              >
                <Ionicons name="trash-outline" size={18} color="#ef4444" />
                <Text style={[styles.managementMenuText, { color: "#ef4444" }]}>강제 삭제</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

      <PostDetailModal
        visible={postDetailModalVisible}
        postId={selectedPostId}
        adminMode
        adminBoardLabel={selectedPostBoardLabel}
        adminAuditContext={selectedPostAuditContext}
        onClose={() => {
          setPostDetailModalVisible(false);
          setSelectedPostBoardLabel(null);
          setSelectedPostAuditContext(null);
        }}
        onPostUpdated={() => loadPosts(postPage)}
      />
      <AdminContentRevisionModal
        visible={revisionModalVisible}
        revisionId={selectedRevisionId}
        onClose={() => {
          setRevisionModalVisible(false);
          setSelectedRevisionId(null);
        }}
      />
      <AdminReportDetailModal
        visible={reportModalVisible}
        selectedReport={selectedReport}
        reportNote={reportNote}
        colors={colors}
        primaryAccent={primaryAccent}
        onChangeReportNote={setReportNote}
        onClose={() => setReportModalVisible(false)}
        onModerate={moderateReport}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "bold",
  },
  refreshBtn: {
    padding: 4,
  },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: 10,
    gap: 10,
  },
  tabItem: {
    minWidth: 110,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 6,
  },
  tabText: {
    fontSize: 13,
  },
  subnavRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  subnavButton: { flex: 1, minHeight: 38, borderWidth: 1, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 16,
  },
  statIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(168, 85, 247, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 42,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    height: 40,
    paddingVertical: 0,
    textAlignVertical: "center",
  },
  activitySearchRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  activitySearchContainer: { flex: 1, marginBottom: 0 },
  activitySearchButton: { height: 42, paddingHorizontal: 14, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  activityLogCard: { padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 10 },
  activityUserHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  detailLabel: { flexDirection: "row", alignItems: "center", gap: 2, marginLeft: 8 },
  activityDetail: { marginTop: 10, paddingTop: 10, borderTopWidth: 1 },
  activityContentRow: {
    marginTop: 10,
    padding: 11,
    borderWidth: 1,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  historyButton: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8, alignSelf: "flex-start", minHeight: 28 },
  historyPanel: { marginTop: 6, marginLeft: 10, padding: 9, borderWidth: 1, borderRadius: 10 },
  historyRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  accountEvents: { padding: 10, borderWidth: 1, borderRadius: 10, marginBottom: 4 },
  accountEventRow: { marginTop: 7, gap: 2 },
  loadMoreButton: { height: 38, marginTop: 14, borderWidth: 1, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  countText: {
    fontSize: 12,
    marginBottom: 10,
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  userAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#ccc",
  },
  usernameText: {
    fontSize: 14,
    fontWeight: "bold",
  },
  adminBadge: {
    backgroundColor: "#a855f7",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  adminBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "bold",
  },
  fullNameText: {
    fontSize: 12,
  },
  emailText: {
    fontSize: 11,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
  },
  toggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  postCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  postAuthor: {
    fontSize: 14,
    fontWeight: "bold",
  },
  postCaption: {
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
  },
  deletePostBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.4)",
  },
  hiddenBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fef3c7",
  },
  managementMenuOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.28)",
    padding: 24,
  },
  managementMenuCard: {
    width: "100%",
    maxWidth: 280,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 8,
  },
  managementMenuAction: {
    minHeight: 46,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  managementMenuText: { fontSize: 15, fontWeight: "700" },
});
