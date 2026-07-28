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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { adminService, AdminStats, AdminUserItem, AdminPostItem, AdminActivityLog } from "../services/adminService";
import { getFullImageUrl } from "../config";
import { PostDetailModal } from "../components/PostDetailModal";
import { AdminUserPostsModal } from "../components/AdminUserPostsModal";
import { AdminContentRevisionModal } from "../components/AdminContentRevisionModal";
import { getDisplayName } from "../utils/displayName";

type AdminTab = "stats" | "users" | "posts" | "activity";

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
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [postDetailModalVisible, setPostDetailModalVisible] = useState(false);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [revisionModalVisible, setRevisionModalVisible] = useState(false);
  const [activityLogs, setActivityLogs] = useState<AdminActivityLog[]>([]);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [activityQuery, setActivityQuery] = useState("");
  const [activityContent, setActivityContent] = useState<any>(null);
  const [activityContentLoading, setActivityContentLoading] = useState(false);
  const activityContentCache = useRef<Map<string, any>>(new Map());
  const activityRequestId = useRef(0);

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

  const loadPosts = async (page: number = 1) => {
    try {
      setLoading(true);
      const res = await adminService.getPosts(page, 20);
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
  const loadActivity = async (q: string = activityQuery) => {
    try {
      setLoading(true);
      activityContentCache.current.clear();
      setActivityContent(null);
      const res = await adminService.getActivityLogs(q);
      setActivityLogs(res.items);
    }
    catch { Alert.alert("오류", "활동 로그를 불러오는데 실패했습니다."); }
    finally { setLoading(false); }
  };

  const toggleActivityLog = async (item: AdminActivityLog) => {
    if (item.revision_id) {
      setSelectedRevisionId(item.revision_id);
      setRevisionModalVisible(true);
      return;
    }
    if (item.target_type === "post" && item.target_id) {
      setSelectedPostId(item.target_id);
      setPostDetailModalVisible(true);
      return;
    }
    const opening = expandedLogId !== item.id;
    setExpandedLogId(opening ? item.id : null);
    if (!opening || !item.user_id) {
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
      await loadPosts(1);
    } else { await loadActivity();
    }
    setRefreshing(false);
  };

  useEffect(() => {
    if (activeTab === "stats") {
      loadStats();
    } else if (activeTab === "users") {
      loadUsers(searchQuery, 1);
    } else if (activeTab === "posts") {
      loadPosts(1);
    } else { loadActivity();
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

  const primaryAccent = isDark ? "#a855f7" : "#7c3aed";
  const cyanBorder = isDark ? "#06b6d4" : "#0284c7";

  const renderActivityLog = ({ item }: { item: AdminActivityLog }) => {
    const isExpanded = expandedLogId === item.id;
    const hasMore = activityContent?.pagination?.posts_has_more || activityContent?.pagination?.comments_has_more;
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => toggleActivityLog(item)}
        style={[styles.activityLogCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}
      >
        <View>
          <Text style={[styles.usernameText, { color: colors.textPrimary }]}>
            {item.username} {item.nickname ? `(${item.nickname})` : ""}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            {item.event_type} · {new Date(item.created_at).toLocaleString()}
          </Text>
        </View>
        {isExpanded && (
          <View style={[styles.activityDetail, { borderTopColor: colors.borderColor }]}>
            <Text style={{ color: colors.textPrimary }}>IP: {item.ip_address || "기록 없음"}</Text>
            {activityContentLoading && !activityContent && (
              <ActivityIndicator style={{ marginVertical: 14 }} color={primaryAccent} />
            )}
            {activityContent?.posts?.map((post: any) => (
              <View key={post.id} style={styles.activityContentRow}>
                <Text style={{ color: primaryAccent, fontWeight: "700" }}>
                  [{post.content_type}] [{post.board_label}] {post.content_number}
                </Text>
                <Text style={{ color: colors.textPrimary, marginTop: 2 }}>{post.display_text || "(내용 없음)"}</Text>
              </View>
            ))}
            {activityContent?.comments?.map((comment: any) => (
              <View key={comment.id} style={styles.activityContentRow}>
                <Text style={{ color: primaryAccent, fontWeight: "700" }}>
                  [{comment.content_type}] [{comment.board_label}] {comment.content_number}
                </Text>
                <Text style={{ color: colors.textMuted, marginTop: 2 }}>{comment.display_text}</Text>
              </View>
            ))}
            {activityContent && hasMore && item.user_id && (
              <TouchableOpacity
                disabled={activityContentLoading}
                onPress={() => loadMoreActivityContent(item.user_id!)}
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
        <TouchableOpacity style={styles.refreshBtn} onPress={() => navigation.navigate("CommunityAdmin")} activeOpacity={0.7}>
          <Ionicons name="list-outline" size={20} color={primaryAccent} />
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
          style={[styles.tabItem, activeTab === "users" && { borderBottomColor: primaryAccent, borderBottomWidth: 3 }]}
          onPress={() => setActiveTab("users")}
        >
          <Ionicons name="people" size={16} color={activeTab === "users" ? primaryAccent : colors.textMuted} />
          <Text style={[styles.tabText, { color: activeTab === "users" ? primaryAccent : colors.textMuted, fontWeight: activeTab === "users" ? "bold" : "500" }]}>
            회원 관리
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === "posts" && { borderBottomColor: primaryAccent, borderBottomWidth: 3 }]}
          onPress={() => setActiveTab("posts")}
        >
          <Ionicons name="images" size={16} color={activeTab === "posts" ? primaryAccent : colors.textMuted} />
          <Text style={[styles.tabText, { color: activeTab === "posts" ? primaryAccent : colors.textMuted, fontWeight: activeTab === "posts" ? "bold" : "500" }]}>
            게시물 관리
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === "activity" && { borderBottomColor: primaryAccent, borderBottomWidth: 3 }]}
          onPress={() => setActiveTab("activity")}
        >
          <Ionicons name="receipt-outline" size={16} color={activeTab === "activity" ? primaryAccent : colors.textMuted} />
          <Text style={[styles.tabText, { color: activeTab === "activity" ? primaryAccent : colors.textMuted, fontWeight: activeTab === "activity" ? "bold" : "500" }]}>활동 로그</Text>
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
                  <Image
                    source={{ uri: getFullImageUrl(item.profile_image_url) }}
                    style={styles.userAvatar}
                  />

                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={[styles.usernameText, { color: colors.textPrimary }]}>{getDisplayName(item)}</Text>
                      {item.is_admin && (
                        <View style={styles.adminBadge}>
                          <Text style={styles.adminBadgeText}>관리자</Text>
                        </View>
                      )}
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
          <Text style={[styles.countText, { color: colors.textMuted }]}>총 {totalPosts}개의 게시물 모니터링 중</Text>

          {loading ? (
            <ActivityIndicator style={{ marginTop: 24 }} size="large" color={primaryAccent} />
          ) : (
            <FlatList
              data={posts}
              keyExtractor={(item) => item.id}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={primaryAccent} />}
              renderItem={({ item }) => {
                const firstMedia = item.media && item.media.length > 0 ? item.media[0] : null;
                const mediaUrl = firstMedia ? (firstMedia.media_url || firstMedia.url || firstMedia.image_url) : null;

                return (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={[styles.postCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}
                    onPress={() => {
                      setSelectedPostId(item.id);
                      setPostDetailModalVisible(true);
                    }}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Ionicons name="eye-outline" size={16} color={primaryAccent} />
                        <Text style={[styles.postAuthor, { color: primaryAccent }]}>
                          {getDisplayName(item.author, "알 수 없음")}
                        </Text>
                      </View>
                      <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                        {item.created_at ? new Date(item.created_at).toLocaleDateString() : ""}
                      </Text>
                    </View>

                    <View style={{ flexDirection: "row", marginTop: 8, gap: 12, alignItems: "center" }}>
                      {mediaUrl ? (
                        <Image
                          source={{ uri: getFullImageUrl(mediaUrl) }}
                          style={{ width: 56, height: 56, borderRadius: 8, backgroundColor: "#ccc" }}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={{ width: 56, height: 56, borderRadius: 8, backgroundColor: colors.bgPrimary, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: colors.borderColor }}>
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

                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                      <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                        👆 클릭하여 상세 팝업 보기
                      </Text>
                      <TouchableOpacity
                        style={styles.deletePostBtn}
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

      {activeTab === "activity" && (
        <View style={{ flex: 1, padding: 16 }}>
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
            data={activityLogs}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingTop: 12 }}
            ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 24 }}>표시할 가입·탈퇴·게시물 활동 로그가 없습니다.</Text>}
            renderItem={renderActivityLog}
          />
        </View>
      )}

      {/* 회원별 작성 게시물 팝업 모달 */}
      <AdminUserPostsModal
        visible={userPostsModalVisible}
        user={selectedUserForModal}
        onClose={() => setUserPostsModalVisible(false)}
      />

      {/* 게시물 상세 팝업 모달 */}
      <PostDetailModal
        visible={postDetailModalVisible}
        postId={selectedPostId}
        onClose={() => setPostDetailModalVisible(false)}
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
  activityDetail: { marginTop: 10, paddingTop: 10, borderTopWidth: 1 },
  activityContentRow: { marginTop: 10 },
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
});
