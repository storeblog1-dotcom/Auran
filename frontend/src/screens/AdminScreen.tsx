import React, { useEffect, useState, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
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
import {
  PostDetailModal,
  AdminPostAuditContext,
} from "../components/PostDetailModal";
import { AdminUserActivityModal } from "../components/AdminUserActivityModal";
import { AdminContentRevisionModal } from "../components/AdminContentRevisionModal";
import { AdminCommunitySection } from "../components/admin/AdminCommunitySection";
import { AdminStatsSection } from "../components/admin/AdminStatsSection";
import { AdminReportDetailModal } from "../components/admin/AdminReportDetailModal";
import { AdminPostSection } from "../components/admin/AdminPostSection";
import { AdminUserSection } from "../components/admin/AdminUserSection";
import { AdminReportSection } from "../components/admin/AdminReportSection";
import { AdminActivitySection } from "../components/admin/AdminActivitySection";

type AdminTab = "stats" | "users" | "posts" | "activity" | "reports" | "community";

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
        <AdminActivitySection
          activityUsers={activityUsers}
          activityQuery={activityQuery}
          totalActivityUsers={totalActivityUsers}
          loading={loading}
          activityLoadingMore={activityLoadingMore}
          expandedActivityUserId={expandedActivityUserId}
          activityContent={activityContent}
          activityContentLoading={activityContentLoading}
          expandedHistoryKey={expandedHistoryKey}
          activityHistory={activityHistory}
          activityHistoryLoading={activityHistoryLoading}
          colors={colors}
          primaryAccent={primaryAccent}
          onChangeActivityQuery={setActivityQuery}
          onSubmitSearch={() => loadActivity(activityQuery, 1, false)}
          onSelectUsersTab={() => setActiveTab("users")}
          onLoadMoreUsers={() => {
            if (!activityLoadingMore && activityUsers.length < totalActivityUsers) {
              loadActivity(activityQuery, activityPage + 1, true);
            }
          }}
          onToggleActivityUser={toggleActivityUser}
          onOpenUser360Modal={(item) => {
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
          onOpenActivityContent={openActivityContent}
          onToggleContentHistory={toggleContentHistory}
          onLoadMoreActivityContent={loadMoreActivityContent}
          onOpenRevisionModal={(revisionId) => {
            setSelectedRevisionId(revisionId);
            setRevisionModalVisible(true);
          }}
        />
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
