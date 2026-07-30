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
import { AdminUserPostsModal } from "../components/AdminUserPostsModal";
import { AdminContentRevisionModal } from "../components/AdminContentRevisionModal";
import { getDisplayName } from "../utils/displayName";
import { AdminAvatar, AdminBadge } from "../components/AdminIdentity";

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
            <Text style={{ color: primaryAccent, fontWeight: "700" }}>
              [{content.content_type}] [{content.board_label}] {content.content_number}
            </Text>
            <Text
              numberOfLines={3}
              style={{ color: colors.textPrimary, marginTop: 3 }}
            >
              {content.display_text || "(내용 없음)"}
            </Text>
            <Text style={{ color: colors.textMuted, marginTop: 6, fontSize: 11 }}>
              최근 행위: {content.latest_event_type || "기록 없음"}
              {" · "}IP {content.latest_event_ip || "기록 없음"}
            </Text>
            <Text style={{ color: colors.textMuted, marginTop: 2, fontSize: 11 }}>
              {content.latest_event_at
                ? new Date(content.latest_event_at).toLocaleString()
                : "시간 기록 없음"}
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
        <ScrollView
          style={{ flex: 1, padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={primaryAccent} />}
        >
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>📊 서비스 핵심 지표 통계</Text>

          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
              <View style={styles.statIconBadge}>
                <Ionicons name="people" size={22} color="#a855f7" />
              </View>
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>{stats?.total_users ?? "-"}</Text>
              <Text style={[styles.statTitle, { color: colors.textMuted }]}>전체 사용자</Text>
            </View>

            <View style={[styles.statCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
              <View style={[styles.statIconBadge, { backgroundColor: "rgba(34, 197, 94, 0.15)" }]}>
                <Ionicons name="checkmark-circle" size={22} color="#22c55e" />
              </View>
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>{stats?.active_users ?? "-"}</Text>
              <Text style={[styles.statTitle, { color: colors.textMuted }]}>활성 계정</Text>
            </View>

            <View style={[styles.statCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
              <View style={[styles.statIconBadge, { backgroundColor: "rgba(6, 182, 212, 0.15)" }]}>
                <Ionicons name="images" size={22} color="#06b6d4" />
              </View>
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>{stats?.total_posts ?? "-"}</Text>
              <Text style={[styles.statTitle, { color: colors.textMuted }]}>총 게시글</Text>
            </View>

            <View style={[styles.statCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
              <View style={[styles.statIconBadge, { backgroundColor: "rgba(236, 72, 153, 0.15)" }]}>
                <Ionicons name="chatbubbles" size={22} color="#ec4899" />
              </View>
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>{stats?.total_comments ?? "-"}</Text>
              <Text style={[styles.statTitle, { color: colors.textMuted }]}>총 댓글</Text>
            </View>

            <View style={[styles.statCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
              <View style={[styles.statIconBadge, { backgroundColor: "rgba(245, 158, 11, 0.15)" }]}>
                <Ionicons name="flash" size={22} color="#f59e0b" />
              </View>
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>{stats?.total_stories ?? "-"}</Text>
              <Text style={[styles.statTitle, { color: colors.textMuted }]}>등록된 스토리</Text>
            </View>
          </View>
        </ScrollView>
      )}

      {activeTab === "users" && (
        <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 12 }}>
          <View style={styles.subnavRow}>
            <TouchableOpacity onPress={() => setActiveTab("users")} style={[styles.subnavButton, { borderColor: primaryAccent, backgroundColor: `${primaryAccent}18` }]}><Text style={{ color: primaryAccent, fontWeight: "700" }}>회원 목록</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setActiveTab("activity")} style={[styles.subnavButton, { borderColor: colors.borderColor }]}><Text style={{ color: colors.textSecondary, fontWeight: "700" }}>활동·보존 이력</Text></TouchableOpacity>
          </View>
          {/* Search Box */}
          <View style={[styles.searchContainer, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <Ionicons name="search" size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              style={[styles.searchInput, { color: colors.textPrimary }]}
              placeholder="사용자명 또는 이름 검색..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={(text) => {
                setSearchQuery(text);
                loadUsers(text, 1);
              }}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  setSearchQuery("");
                  loadUsers("", 1);
                }}
              >
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          <Text style={[styles.countText, { color: colors.textMuted }]}>총 {totalUsers}명의 회원 검색됨</Text>

          {loading ? (
            <ActivityIndicator style={{ marginTop: 24 }} size="large" color={primaryAccent} />
          ) : (
            <FlatList
              data={users}
              keyExtractor={(item) => item.id}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={primaryAccent} />}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.userCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}
                  activeOpacity={0.8}
                  onPress={() => {
                    setSelectedUserForModal(item);
                    setUserPostsModalVisible(true);
                  }}
                >
                  <AdminAvatar user={item} style={styles.userAvatar} />

                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={[styles.usernameText, { color: colors.textPrimary }]}>{getDisplayName(item)}</Text>
                      {item.is_admin && <AdminBadge />}
                    </View>
                    <Text style={[styles.fullNameText, { color: colors.textMuted }]}>{item.full_name}</Text>
                    <Text style={[styles.emailText, { color: colors.textMuted }]}>{item.email}</Text>
                    {item.withdrawal_status === "pending" && item.withdrawal_cancelable_until && (
                      <Text style={[styles.emailText, { color: "#f59e0b" }]}>
                        취소 가능: {new Date(item.withdrawal_cancelable_until).toLocaleString("ko-KR")}
                      </Text>
                    )}
                    {item.withdrawal_status === "finalized" && item.personal_data_retention_until && (
                      <Text style={[styles.emailText, { color: colors.textMuted }]}>
                        개인정보 파기 예정: {new Date(item.personal_data_retention_until).toLocaleString("ko-KR")}
                      </Text>
                    )}
                    {item.personal_data_legal_hold && (
                      <Text style={[styles.emailText, { color: "#ef4444" }]}>적법한 보존 요청 적용 중</Text>
                    )}
                  </View>

                  <View style={{ alignItems: "flex-end" }}>
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor:
                            item.withdrawal_status === "pending"
                              ? "rgba(245, 158, 11, 0.15)"
                              : item.is_active
                                ? "rgba(34, 197, 94, 0.15)"
                                : "rgba(239, 68, 68, 0.15)",
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: item.withdrawal_status === "pending" ? "#f59e0b" : item.is_active ? "#22c55e" : "#ef4444",
                          fontSize: 11,
                          fontWeight: "bold",
                        }}
                      >
                        {item.withdrawal_status === "pending"
                          ? "탈퇴 대기"
                          : item.withdrawal_status === "finalized"
                            ? "최종 탈퇴"
                            : item.withdrawal_status === "purged"
                              ? "개인정보 파기"
                              : item.is_active
                                ? "정상"
                                : "정지"}
                      </Text>
                    </View>

                    {!item.is_admin && !item.withdrawal_status && (
                      <TouchableOpacity
                        style={[
                          styles.toggleBtn,
                          {
                            borderColor: item.is_active ? "#ef4444" : "#22c55e",
                            backgroundColor: item.is_active ? "rgba(239, 68, 68, 0.1)" : "rgba(34, 197, 94, 0.1)",
                          },
                        ]}
                        onPress={() => handleToggleUserActive(item)}
                        activeOpacity={0.7}
                      >
                        <Text style={{ color: item.is_active ? "#ef4444" : "#22c55e", fontSize: 12, fontWeight: "600" }}>
                          {item.is_active ? "정지하기" : "해제하기"}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      )}

      {activeTab === "posts" && (
        <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 12 }}>
          <View style={styles.subnavRow}>
            <TouchableOpacity onPress={() => { setContentScope("feed"); loadPosts(1, "feed"); }} style={[styles.subnavButton, { borderColor: contentScope === "feed" ? primaryAccent : colors.borderColor, backgroundColor: contentScope === "feed" ? `${primaryAccent}18` : "transparent" }]}><Text style={{ color: contentScope === "feed" ? primaryAccent : colors.textSecondary, fontWeight: "700" }}>피드</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => { setContentScope("community"); loadPosts(1, "community"); }} style={[styles.subnavButton, { borderColor: contentScope === "community" ? primaryAccent : colors.borderColor, backgroundColor: contentScope === "community" ? `${primaryAccent}18` : "transparent" }]}><Text style={{ color: contentScope === "community" ? primaryAccent : colors.textSecondary, fontWeight: "700" }}>게시판</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setActiveTab("reports")} style={[styles.subnavButton, { borderColor: colors.borderColor }]}><Text style={{ color: colors.textSecondary, fontWeight: "700" }}>신고됨</Text></TouchableOpacity>
          </View>
          <Text style={[styles.countText, { color: colors.textMuted }]}>최신순 · 총 {totalPosts}개</Text>

          {loading ? (
            <ActivityIndicator style={{ marginTop: 24 }} size="large" color={primaryAccent} />
          ) : (
            <FlatList
              data={posts}
              keyExtractor={(item) => item.id}
              key={`content-grid-${contentScope}`}
              numColumns={3}
              columnWrapperStyle={styles.contentGridRow}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={primaryAccent} />}
              renderItem={({ item }) => {
                const firstMedia = item.media && item.media.length > 0 ? item.media[0] : null;
                const mediaUrl = firstMedia ? (firstMedia.media_url || firstMedia.url || firstMedia.image_url) : null;

                return (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={[styles.contentTile, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}
                    onPress={() => {
                      setSelectedPostId(item.id);
                      setPostDetailModalVisible(true);
                    }}
                  >
                    <View style={styles.contentTileHeader}>
                      <View style={styles.contentTileAuthorRow}>
                        <Ionicons name="eye-outline" size={16} color={primaryAccent} />
                        <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.postAuthor, styles.contentTileAuthor, { color: primaryAccent }]}>
                          {getDisplayName(item.author, "알 수 없음")}
                        </Text>
                        {item.author.is_admin && <AdminBadge compact />}
                      </View>
                      <View style={styles.contentTileMenu}>
                        {item.moderation_hidden && <View style={styles.hiddenBadge}><Ionicons name="eye-off-outline" size={11} color="#b45309" /></View>}
                        <TouchableOpacity
                          style={styles.contentTileMenuButton}
                          accessibilityLabel="콘텐츠 관리 메뉴"
                          hitSlop={8}
                          onPress={(event) => {
                            event.stopPropagation();
                            openPostManagementMenu(item);
                          }}
                        >
                          <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={styles.contentTileBody}>
                      {mediaUrl ? (
                        <Image
                          source={{ uri: getFullImageUrl(mediaUrl) }}
                          style={styles.contentTileImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={[styles.contentTileText, { backgroundColor: colors.bgPrimary, borderColor: colors.borderColor }]}>
                          <Ionicons name="document-text-outline" size={22} color={colors.textMuted} />
                        </View>
                      )}

                      <View style={{ flex: 1 }}>
                        <Text style={[styles.postCaption, { color: colors.textPrimary, marginTop: 0 }]} numberOfLines={2}>
                          {item.caption || "(캡션 없음)"}
                        </Text>
                        {item.media && item.media.length > 1 && (
                          <Text style={{ color: primaryAccent, fontSize: 11, marginTop: 2, fontWeight: "600" }}>
                            📷 미디어 {item.media.length}개
                          </Text>
                        )}
                      </View>
                    </View>

                    <View style={styles.contentTileFooter}>
                      <Text style={{ display: "none" }}>
                        👆 클릭하여 상세 팝업 보기
                      </Text>
                      <TouchableOpacity
                        style={styles.contentTileDeleteBtn}
                        onPress={() => handleDeletePost(item)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="trash-outline" size={14} color="#ef4444" />
                        <Text style={{ color: "#ef4444", fontSize: 12, fontWeight: "600", marginLeft: 4 }}>
                          강제 삭제
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      )}

      {activeTab === "reports" && (
        <View style={{ flex: 1, padding: 16 }}>
          <View style={styles.subnavRow}>
            <TouchableOpacity onPress={() => { setContentScope("feed"); setActiveTab("posts"); }} style={[styles.subnavButton, { borderColor: colors.borderColor }]}><Text style={{ color: colors.textSecondary, fontWeight: "700" }}>피드</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => { setContentScope("community"); setActiveTab("posts"); }} style={[styles.subnavButton, { borderColor: colors.borderColor }]}><Text style={{ color: colors.textSecondary, fontWeight: "700" }}>게시판</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setActiveTab("reports")} style={[styles.subnavButton, { borderColor: primaryAccent, backgroundColor: `${primaryAccent}18` }]}><Text style={{ color: primaryAccent, fontWeight: "700" }}>신고됨</Text></TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
            {[
              ["", "전체"],
              ["received", "접수"],
              ["reviewing", "검토 중"],
              ["resolved", "조치 완료"],
              ["rejected", "기각"],
            ].map(([value, label]) => (
              <TouchableOpacity
                key={value}
                onPress={() => {
                  setReportStatus(value);
                  setTimeout(() => adminService.getReports(value || undefined).then((result) => setReports(result.items)), 0);
                }}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                  borderRadius: 18,
                  backgroundColor: reportStatus === value ? primaryAccent : colors.bgCard,
                  borderWidth: 1,
                  borderColor: reportStatus === value ? primaryAccent : colors.borderColor,
                }}
              >
                <Text style={{ color: reportStatus === value ? "#fff" : colors.textPrimary, fontWeight: "700" }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {loading ? (
            <ActivityIndicator style={{ marginTop: 24 }} color={primaryAccent} />
          ) : (
            <FlatList
              data={reports}
              keyExtractor={(item) => `${item.target_type}:${item.target_id}`}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={primaryAccent} />}
              ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 28 }}>접수된 신고가 없습니다.</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => openReport(item)}
                  style={[styles.userCard, { backgroundColor: colors.bgCard, borderColor: item.priority ? "#ef4444" : colors.borderColor }]}
                >
                  <View style={[styles.statIconBadge, { marginBottom: 0, backgroundColor: item.priority ? "rgba(239,68,68,0.12)" : "rgba(124,58,237,0.12)" }]}>
                    <Ionicons name={item.target_type === "profile" ? "person-outline" : item.target_type === "comment" ? "chatbubble-outline" : "document-text-outline"} size={21} color={item.priority ? "#ef4444" : primaryAccent} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ color: colors.textPrimary, fontWeight: "800" }}>
                      {item.target_type === "post" ? "게시물" : item.target_type === "comment" ? "댓글·대댓글" : "프로필"} · 신고 {item.report_count}건
                    </Text>
                    <Text numberOfLines={2} style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
                      {item.snapshot.title || item.snapshot.comment_content || item.snapshot.caption || item.snapshot.bio || "(내용 없음)"}
                    </Text>
                    <Text style={{ color: primaryAccent, fontSize: 11, marginTop: 5 }}>
                      {item.status} · {new Date(item.latest_at).toLocaleString("ko-KR")}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            />
          )}
        </View>
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
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 2 }]}>커뮤니티 관리</Text>
          <Text style={{ color: colors.textSecondary, lineHeight: 20 }}>게시판과 공지를 한 곳에서 관리합니다. 생성과 수정은 아래 항목을 선택해 바로 진행할 수 있습니다.</Text>
          <TouchableOpacity
            style={[styles.managementCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}
            onPress={() => navigation.navigate("CommunityAdmin", { mode: "create" })}
          >
            <View style={[styles.managementIcon, { backgroundColor: `${primaryAccent}18` }]}><Ionicons name="add-circle-outline" size={25} color={primaryAccent} /></View>
            <View style={{ flex: 1 }}><Text style={{ color: colors.textPrimary, fontWeight: "800", fontSize: 15 }}>게시판 생성</Text><Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>새 상위·하위 게시판을 추가합니다.</Text></View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.managementCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}
            onPress={() => navigation.navigate("CommunityAdmin", { mode: "edit" })}
          >
            <View style={[styles.managementIcon, { backgroundColor: "rgba(6,182,212,0.14)" }]}><Ionicons name="create-outline" size={25} color="#06b6d4" /></View>
            <View style={{ flex: 1 }}><Text style={{ color: colors.textPrimary, fontWeight: "800", fontSize: 15 }}>게시판 수정·정렬</Text><Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>목록에서 게시판을 선택해 이름, 공개 방식, 순서를 바꿉니다.</Text></View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.managementCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}
            onPress={() => navigation.navigate("CommunityAdmin", { mode: "notice" })}
          >
            <View style={[styles.managementIcon, { backgroundColor: "rgba(245,158,11,0.14)" }]}><Ionicons name="megaphone-outline" size={25} color="#f59e0b" /></View>
            <View style={{ flex: 1 }}><Text style={{ color: colors.textPrimary, fontWeight: "800", fontSize: 15 }}>전체 공지</Text><Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>커뮤니티 상단에 공지할 내용을 등록합니다.</Text></View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* 회원별 작성 게시물 팝업 모달 */}
      <AdminUserPostsModal
        visible={userPostsModalVisible}
        user={selectedUserForModal}
        onClose={() => setUserPostsModalVisible(false)}
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
              <TouchableOpacity
                style={styles.managementMenuAction}
                onPress={() => {
                  setManagedPost(null);
                  setSelectedPostId(managedPost.id);
                  setPostDetailModalVisible(true);
                }}
              >
                <Ionicons name="open-outline" size={18} color={colors.textPrimary} />
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
      <Modal visible={reportModalVisible} animationType="slide" onRequestClose={() => setReportModalVisible(false)}>
        <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
          <View style={[styles.header, { borderBottomColor: colors.borderColor }]}>
            <TouchableOpacity onPress={() => setReportModalVisible(false)}><Ionicons name="close" size={25} color={colors.textPrimary} /></TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>신고 상세</Text>
            <View style={{ width: 25 }} />
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 36 }}>
            {selectedReport && (
              <>
                <View style={[styles.postCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
                  <Text style={{ color: primaryAccent, fontWeight: "900" }}>
                    {selectedReport.target_type.toUpperCase()} · {selectedReport.report_count}건
                  </Text>
                  <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "800", marginTop: 10 }}>
                    {selectedReport.snapshot.title || selectedReport.snapshot.comment_content || selectedReport.snapshot.caption || selectedReport.snapshot.bio || "(내용 없음)"}
                  </Text>
                  {!!selectedReport.snapshot.content_ip && <Text style={{ color: colors.textMuted, marginTop: 8 }}>작성 IP: {selectedReport.snapshot.content_ip}</Text>}
                  {!!selectedReport.snapshot.comment_ip && <Text style={{ color: colors.textMuted, marginTop: 8 }}>댓글 IP: {selectedReport.snapshot.comment_ip}</Text>}
                  <Text style={{ color: colors.textMuted, marginTop: 6 }}>
                    고유번호: {selectedReport.snapshot.display_number || selectedReport.snapshot.comment_display_number || "-"}
                  </Text>
                  {selectedReport.target_type === "post" && (getReportedPostImages(selectedReport.snapshot).length > 0 ? (
                    <View style={{ marginTop: 14 }}>
                      <Text style={{ color: colors.textSecondary, fontWeight: "800", marginBottom: 8 }}>신고 게시물 이미지</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                        {getReportedPostImages(selectedReport.snapshot).map((media, index) => <View key={`${media.url}-${index}`} style={{ width: 168, height: 168, borderRadius: 12, overflow: "hidden", backgroundColor: colors.bgPrimary, borderWidth: 1, borderColor: colors.borderColor, alignItems: "center", justifyContent: "center" }}>
                          <Ionicons name="image-outline" size={28} color={colors.textMuted} />
                          <Image source={{ uri: getFullImageUrl(media.url!) }} style={{ position: "absolute", width: "100%", height: "100%" }} resizeMode="cover" />
                        </View>)}
                      </ScrollView>
                    </View>
                  ) : <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14 }}><Ionicons name="image-outline" size={16} color={colors.textMuted} /><Text style={{ color: colors.textMuted, fontSize: 12 }}>저장된 게시물 이미지가 없습니다.</Text></View>)}
                </View>
                {selectedReport.reports?.map((report) => (
                  <View key={report.id} style={[styles.postCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
                    <Text style={{ color: colors.textPrimary, fontWeight: "800" }}>{report.reason_code}</Text>
                    {!!report.detail && <Text style={{ color: colors.textPrimary, marginTop: 5 }}>{report.detail}</Text>}
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 7 }}>신고 IP: {report.reporter_ip || "기록 없음"}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 3 }}>{new Date(report.created_at).toLocaleString("ko-KR")}</Text>
                  </View>
                ))}
                <TextInput
                  value={reportNote}
                  onChangeText={setReportNote}
                  multiline
                  placeholder="처리 메모 또는 경고 내용을 입력하세요."
                  placeholderTextColor={colors.textMuted}
                  style={[styles.searchInput, { color: colors.textPrimary, backgroundColor: colors.bgCard, borderColor: colors.borderColor, borderWidth: 1, borderRadius: 12, minHeight: 90, padding: 12, textAlignVertical: "top" }]}
                />
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
                  {[
                    ["reviewing", "maintain", "검토 중"],
                    ["resolved", "maintain", "유지"],
                    ["resolved", "hide", "숨김"],
                    ["resolved", "delete", "삭제"],
                    ["resolved", "warn", "경고"],
                    ["resolved", "suspend", "정지"],
                    ["rejected", "maintain", "기각"],
                  ].map(([statusValue, actionValue, label]) => (
                    <TouchableOpacity
                      key={`${statusValue}:${actionValue}`}
                      onPress={() => moderateReport(statusValue as any, actionValue as any)}
                      style={{ backgroundColor: actionValue === "delete" || actionValue === "suspend" ? "#ef4444" : primaryAccent, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12 }}
                    >
                      <Text style={{ color: "#fff", fontWeight: "800" }}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
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
  managementCard: { minHeight: 88, borderWidth: 1, borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  managementIcon: { width: 46, height: 46, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  statCard: {
    width: "48%",
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
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
  statValue: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 2,
  },
  statTitle: {
    fontSize: 12,
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
  contentGridRow: { gap: 7, marginBottom: 7 },
  contentTile: { flex: 1, maxWidth: "32.2%", minHeight: 198, padding: 7, borderRadius: 10, borderWidth: 1 },
  contentTileHeader: { flexDirection: "row", alignItems: "center", minHeight: 22 },
  contentTileAuthorRow: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 4, paddingRight: 3 },
  contentTileAuthor: { flexShrink: 1, minWidth: 0, fontSize: 13 },
  contentTileMenu: { width: 24, alignItems: "flex-end", justifyContent: "center" },
  contentTileMenuButton: { width: 24, height: 24, alignItems: "center", justifyContent: "center" },
  contentTileBody: { flex: 1, flexDirection: "column", marginTop: 8, gap: 7, alignItems: "stretch" },
  contentTileImage: { width: "100%", height: 82, borderRadius: 7, backgroundColor: "#ccc" },
  contentTileText: { width: "100%", height: 82, borderRadius: 7, justifyContent: "center", alignItems: "center", borderWidth: 1, padding: 7 },
  postAuthor: {
    fontSize: 14,
    fontWeight: "bold",
  },
  postCaption: {
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
  },
  contentTileFooter: { minHeight: 34, marginTop: 6, flexDirection: "row", justifyContent: "flex-end", alignItems: "center" },
  contentTileDeleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 30,
    paddingHorizontal: 7,
    borderRadius: 8,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.4)",
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
