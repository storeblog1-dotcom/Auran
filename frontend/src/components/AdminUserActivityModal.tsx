import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import {
  adminService,
  AdminUserItem,
  AdminReportGroup,
} from "../services/adminService";
import { getDisplayName } from "../utils/displayName";
import { AdminAvatar, AdminBadge } from "./AdminIdentity";
import { PostDetailModal, AdminPostAuditContext } from "./PostDetailModal";
import { AdminContentRevisionModal } from "./AdminContentRevisionModal";

interface AdminUserActivityModalProps {
  visible: boolean;
  user: AdminUserItem | null;
  onClose: () => void;
  onUserUpdated?: () => void;
}

type ModalTab = "overview" | "posts" | "comments" | "reports";

export const AdminUserActivityModal: React.FC<AdminUserActivityModalProps> = ({
  visible,
  user,
  onClose,
  onUserUpdated,
}) => {
  const { colors, isDark } = useTheme();
  const [activeTab, setActiveTab] = useState<ModalTab>("overview");
  const [loading, setLoading] = useState<boolean>(false);

  // Content Data
  const [userContent, setUserContent] = useState<any | null>(null);
  const [userReports, setUserReports] = useState<AdminReportGroup[]>([]);
  const [togglingActive, setTogglingActive] = useState<boolean>(false);

  // Detail Modals
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [selectedPostBoardLabel, setSelectedPostBoardLabel] = useState<string | null>(null);
  const [selectedPostAuditContext, setSelectedPostAuditContext] = useState<AdminPostAuditContext | null>(null);
  const [postDetailModalVisible, setPostDetailModalVisible] = useState<boolean>(false);

  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [revisionModalVisible, setRevisionModalVisible] = useState<boolean>(false);

  const primaryAccent = isDark ? "#a855f7" : "#7c3aed";

  const fetchUserData = async (userId: string) => {
    setLoading(true);
    try {
      const [contentData, reportsRes] = await Promise.all([
        adminService.getUserContent(userId, 1, 1, 50).catch(() => null),
        adminService.getReports().catch(() => ({ items: [] })),
      ]);

      setUserContent(contentData);
      if (reportsRes && reportsRes.items) {
        const filtered = reportsRes.items.filter(
          (r: AdminReportGroup) => String(r.target_user_id) === String(userId)
        );
        setUserReports(filtered);
      }
    } catch (err) {
      console.log("Failed to fetch user activity data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible && user?.id) {
      setActiveTab("overview");
      fetchUserData(user.id);
    } else {
      setUserContent(null);
      setUserReports([]);
    }
  }, [visible, user]);

  const handleToggleActive = async () => {
    if (!user) return;
    const actionText = user.is_active ? "정지" : "활성화";
    Alert.alert(
      `계정 ${actionText}`,
      `정말로 @${user.username} 계정을 ${actionText}하시겠습니까?`,
      [
        { text: "취소", style: "cancel" },
        {
          text: actionText,
          style: user.is_active ? "destructive" : "default",
          onPress: async () => {
            setTogglingActive(true);
            try {
              await adminService.toggleUserActive(user.id);
              Alert.alert("완료", `계정이 ${actionText} 처리되었습니다.`);
              if (onUserUpdated) onUserUpdated();
            } catch {
              Alert.alert("오류", `계정 ${actionText} 처리에 실패했습니다.`);
            } finally {
              setTogglingActive(false);
            }
          },
        },
      ]
    );
  };

  const handleOpenItem = (item: any, contentType: "post" | "comment") => {
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
    setSelectedPostBoardLabel(item.board_name || item.board_type || null);
    setSelectedPostAuditContext({
      contentNumber: item.content_number || (item.display_number ? `P-${String(item.display_number).padStart(6, "0")}` : null),
      contentType: item.content_type || (contentType === "post" ? "게시물" : "댓글"),
      eventType: item.deleted ? "deleted" : "active",
      eventIp: null,
      eventAt: item.created_at,
    });
    setPostDetailModalVisible(true);
  };

  if (!visible || !user) return null;

  const livePosts = userContent?.posts?.filter((p: any) => !p.deleted) || [];
  const deletedPosts = userContent?.posts?.filter((p: any) => p.deleted) || [];
  const liveComments = userContent?.comments?.filter((c: any) => !c.deleted) || [];
  const deletedComments = userContent?.comments?.filter((c: any) => c.deleted) || [];

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.borderColor }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            회원 360° 통합 활동 모달
          </Text>
          <View style={{ width: 32 }} />
        </View>

        {/* User Profile Card */}
        <View style={[styles.userProfileCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
          <AdminAvatar user={user} style={styles.avatar} />
          <View style={styles.userInfoTextContainer}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={[styles.usernameText, { color: colors.textPrimary }]}>{getDisplayName(user)}</Text>
              {user.is_admin && <AdminBadge />}
            </View>
            <Text style={[styles.fullNameText, { color: colors.textMuted }]}>{user.full_name || `@${user.username}`}</Text>
            <Text style={[styles.emailText, { color: colors.textMuted }]}>{user.email}</Text>
          </View>

          {/* Status Badge & Action */}
          <View style={{ alignItems: "flex-end", gap: 6 }}>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: user.is_active ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)" },
              ]}
            >
              <Text style={{ color: user.is_active ? "#22c55e" : "#ef4444", fontSize: 11, fontWeight: "bold" }}>
                {user.is_active ? "🟢 정상" : "🔴 정지"}
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.toggleActiveBtn,
                { backgroundColor: user.is_active ? "rgba(239, 68, 68, 0.1)" : "rgba(34, 197, 94, 0.1)" },
              ]}
              onPress={handleToggleActive}
              disabled={togglingActive}
            >
              {togglingActive ? (
                <ActivityIndicator size="small" color={user.is_active ? "#ef4444" : "#22c55e"} />
              ) : (
                <Text style={{ color: user.is_active ? "#ef4444" : "#22c55e", fontSize: 11, fontWeight: "bold" }}>
                  {user.is_active ? "계정 정지" : "정지 해제"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Summary Chips Banner */}
        <View style={[styles.summaryChipsRow, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
          <View style={styles.chipItem}>
            <Text style={[styles.chipNumber, { color: primaryAccent }]}>{livePosts.length}</Text>
            <Text style={[styles.chipLabel, { color: colors.textMuted }]}>게시물</Text>
          </View>
          <View style={styles.chipDivider} />
          <View style={styles.chipItem}>
            <Text style={[styles.chipNumber, { color: "#3b82f6" }]}>{liveComments.length}</Text>
            <Text style={[styles.chipLabel, { color: colors.textMuted }]}>댓글</Text>
          </View>
          <View style={styles.chipDivider} />
          <View style={styles.chipItem}>
            <Text style={[styles.chipNumber, { color: "#ef4444" }]}>
              {deletedPosts.length + deletedComments.length}
            </Text>
            <Text style={[styles.chipLabel, { color: colors.textMuted }]}>보존/삭제</Text>
          </View>
          <View style={styles.chipDivider} />
          <View style={styles.chipItem}>
            <Text style={[styles.chipNumber, { color: "#f59e0b" }]}>{userReports.length}</Text>
            <Text style={[styles.chipLabel, { color: colors.textMuted }]}>피신고</Text>
          </View>
        </View>

        {/* Segmented Tab Control */}
        <View style={[styles.segmentedBar, { backgroundColor: colors.bgInput }]}>
          <TouchableOpacity
            style={[styles.segmentedTab, activeTab === "overview" && { backgroundColor: colors.bgCard }]}
            onPress={() => setActiveTab("overview")}
          >
            <Text style={[styles.tabLabel, activeTab === "overview" ? { color: primaryAccent, fontWeight: "bold" } : { color: colors.textMuted }]}>
              개요·보존
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentedTab, activeTab === "posts" && { backgroundColor: colors.bgCard }]}
            onPress={() => setActiveTab("posts")}
          >
            <Text style={[styles.tabLabel, activeTab === "posts" ? { color: primaryAccent, fontWeight: "bold" } : { color: colors.textMuted }]}>
              게시물 ({userContent?.posts?.length || 0})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentedTab, activeTab === "comments" && { backgroundColor: colors.bgCard }]}
            onPress={() => setActiveTab("comments")}
          >
            <Text style={[styles.tabLabel, activeTab === "comments" ? { color: primaryAccent, fontWeight: "bold" } : { color: colors.textMuted }]}>
              댓글 ({userContent?.comments?.length || 0})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentedTab, activeTab === "reports" && { backgroundColor: colors.bgCard }]}
            onPress={() => setActiveTab("reports")}
          >
            <Text style={[styles.tabLabel, activeTab === "reports" ? { color: primaryAccent, fontWeight: "bold" } : { color: colors.textMuted }]}>
              신고 ({userReports.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tab Body View */}
        {loading ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color={primaryAccent} />
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            {activeTab === "overview" && (
              <ScrollView style={{ flex: 1, padding: 16 }}>
                {/* Account Details Card */}
                <View style={[styles.infoSectionCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
                  <Text style={[styles.infoSectionTitle, { color: colors.textPrimary }]}>📋 계정 상태 정보</Text>
                  <View style={styles.infoRow}>
                    <Text style={[styles.infoKey, { color: colors.textMuted }]}>가입일시</Text>
                    <Text style={[styles.infoVal, { color: colors.textPrimary }]}>
                      {user.created_at ? new Date(user.created_at).toLocaleString("ko-KR") : "기록 없음"}
                    </Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={[styles.infoKey, { color: colors.textMuted }]}>탈퇴 진행 상태</Text>
                    <Text style={[styles.infoVal, { color: user.withdrawal_status ? "#ef4444" : "#22c55e" }]}>
                      {user.withdrawal_status === "pending" ? "탈퇴 유예 중" : user.withdrawal_status === "finalized" ? "탈퇴 완료" : user.withdrawal_status === "purged" ? "개인정보 영구파기" : "정상 회원"}
                    </Text>
                  </View>
                  {user.withdrawal_requested_at && (
                    <View style={styles.infoRow}>
                      <Text style={[styles.infoKey, { color: colors.textMuted }]}>탈퇴 신청일</Text>
                      <Text style={[styles.infoVal, { color: colors.textPrimary }]}>
                        {new Date(user.withdrawal_requested_at).toLocaleString("ko-KR")}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Retained Deleted Content Quick View */}
                <View style={[styles.infoSectionCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor, marginTop: 12 }]}>
                  <Text style={[styles.infoSectionTitle, { color: colors.textPrimary }]}>
                    📦 활동 보존 및 삭제 콘텐츠 ({deletedPosts.length + deletedComments.length}건)
                  </Text>
                  {deletedPosts.length === 0 && deletedComments.length === 0 ? (
                    <Text style={{ color: colors.textMuted, fontSize: 13, paddingVertical: 8 }}>
                      보존된 삭제 콘텐츠가 없습니다.
                    </Text>
                  ) : (
                    <>
                      {deletedPosts.map((p: any) => (
                        <TouchableOpacity
                          key={p.revision_id || p.id}
                          style={[styles.contentItemRow, { borderBottomColor: colors.borderColor }]}
                          onPress={() => handleOpenItem(p, "post")}
                        >
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                              <View style={[styles.tagBadge, { backgroundColor: "rgba(239, 68, 68, 0.15)" }]}>
                                <Text style={{ color: "#ef4444", fontSize: 10, fontWeight: "bold" }}>보존 게시물</Text>
                              </View>
                              <Text style={[styles.itemNumberText, { color: primaryAccent }]}>
                                P-{String(p.display_number || 0).padStart(6, "0")}
                              </Text>
                            </View>
                            <Text style={[styles.itemTitleText, { color: colors.textPrimary, marginTop: 3 }]} numberOfLines={1}>
                              {p.title || p.caption || "제목 없음"}
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                        </TouchableOpacity>
                      ))}
                      {deletedComments.map((c: any) => (
                        <TouchableOpacity
                          key={c.revision_id || c.id}
                          style={[styles.contentItemRow, { borderBottomColor: colors.borderColor }]}
                          onPress={() => handleOpenItem(c, "comment")}
                        >
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                              <View style={[styles.tagBadge, { backgroundColor: "rgba(239, 68, 68, 0.15)" }]}>
                                <Text style={{ color: "#ef4444", fontSize: 10, fontWeight: "bold" }}>보존 댓글</Text>
                              </View>
                              <Text style={[styles.itemNumberText, { color: "#3b82f6" }]}>
                                {c.post_display_number ? `P-${String(c.post_display_number).padStart(6, "0")}-C-${String(c.display_number || 0).padStart(3, "0")}` : "댓글"}
                              </Text>
                            </View>
                            <Text style={[styles.itemTitleText, { color: colors.textPrimary, marginTop: 3 }]} numberOfLines={1}>
                              {c.content || "내용 없음"}
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                        </TouchableOpacity>
                      ))}
                    </>
                  )}
                </View>
              </ScrollView>
            )}

            {activeTab === "posts" && (
              <FlatList
                data={userContent?.posts || []}
                keyExtractor={(item) => item.revision_id || item.id}
                contentContainerStyle={{ padding: 16 }}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={{ color: colors.textMuted }}>작성된 게시물이 없습니다.</Text>
                  </View>
                }
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.contentCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}
                    onPress={() => handleOpenItem(item, "post")}
                  >
                    <View style={styles.cardHeader}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <View
                          style={[
                            styles.tagBadge,
                            { backgroundColor: item.deleted ? "rgba(239, 68, 68, 0.15)" : "rgba(34, 197, 94, 0.15)" },
                          ]}
                        >
                          <Text style={{ color: item.deleted ? "#ef4444" : "#22c55e", fontSize: 10, fontWeight: "bold" }}>
                            {item.deleted ? "삭제됨 (보존)" : "게시 중"}
                          </Text>
                        </View>
                        {!!item.board_name && (
                          <Text style={[styles.boardNameBadge, { color: colors.accentBlue }]}>
                            {item.board_name}
                          </Text>
                        )}
                      </View>
                      <Text style={[styles.dateText, { color: colors.textMuted }]}>
                        {new Date(item.created_at).toLocaleDateString("ko-KR")}
                      </Text>
                    </View>
                    <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                      {item.title || item.caption || "내용 없음"}
                    </Text>
                    {!!item.caption && (
                      <Text style={[styles.cardCaption, { color: colors.textSecondary }]} numberOfLines={2}>
                        {item.caption}
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
              />
            )}

            {activeTab === "comments" && (
              <FlatList
                data={userContent?.comments || []}
                keyExtractor={(item) => item.revision_id || item.id}
                contentContainerStyle={{ padding: 16 }}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={{ color: colors.textMuted }}>작성된 댓글이 없습니다.</Text>
                  </View>
                }
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.contentCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}
                    onPress={() => handleOpenItem(item, "comment")}
                  >
                    <View style={styles.cardHeader}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <View
                          style={[
                            styles.tagBadge,
                            { backgroundColor: item.deleted ? "rgba(239, 68, 68, 0.15)" : "rgba(59, 130, 246, 0.15)" },
                          ]}
                        >
                          <Text style={{ color: item.deleted ? "#ef4444" : "#3b82f6", fontSize: 10, fontWeight: "bold" }}>
                            {item.deleted ? "삭제됨 (보존)" : "게시 중"}
                          </Text>
                        </View>
                        <Text style={[styles.itemNumberText, { color: colors.textMuted }]}>
                          {item.parent_id ? "대댓글" : "댓글"}
                        </Text>
                      </View>
                      <Text style={[styles.dateText, { color: colors.textMuted }]}>
                        {new Date(item.created_at).toLocaleDateString("ko-KR")}
                      </Text>
                    </View>
                    <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                      {item.content}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            )}

            {activeTab === "reports" && (
              <FlatList
                data={userReports}
                keyExtractor={(item) => `${item.target_type}:${item.target_id}`}
                contentContainerStyle={{ padding: 16 }}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={{ color: colors.textMuted }}>접수된 신고 내역이 없습니다.</Text>
                  </View>
                }
                renderItem={({ item }) => (
                  <View style={[styles.contentCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
                    <View style={styles.cardHeader}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <View style={[styles.tagBadge, { backgroundColor: "rgba(245, 158, 11, 0.15)" }]}>
                          <Text style={{ color: "#f59e0b", fontSize: 10, fontWeight: "bold" }}>
                            신고 {item.report_count}건
                          </Text>
                        </View>
                        <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: "bold" }}>
                          {item.target_type === "post" ? "게시물" : item.target_type === "comment" ? "댓글" : "프로필"}
                        </Text>
                      </View>
                      <Text style={[styles.dateText, { color: colors.textMuted }]}>
                        {new Date(item.latest_at).toLocaleDateString("ko-KR")}
                      </Text>
                    </View>
                    <Text style={[styles.cardTitle, { color: colors.textPrimary, marginTop: 4 }]} numberOfLines={2}>
                      {item.snapshot?.title || item.snapshot?.caption || item.snapshot?.content || "상세 내용 없음"}
                    </Text>
                  </View>
                )}
              />
            )}
          </View>
        )}

        {/* Post Detail Modal */}
        {selectedPostId && (
          <PostDetailModal
            visible={postDetailModalVisible}
            postId={selectedPostId}
            adminMode={true}
            adminBoardLabel={selectedPostBoardLabel}
            adminAuditContext={selectedPostAuditContext}
            onClose={() => setPostDetailModalVisible(false)}
          />
        )}

        {/* Revision Detail Modal */}
        {selectedRevisionId && (
          <AdminContentRevisionModal
            visible={revisionModalVisible}
            revisionId={selectedRevisionId}
            onClose={() => setRevisionModalVisible(false)}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeBtn: { padding: 4 },
  headerTitle: { fontSize: 16, fontWeight: "bold" },
  userProfileCard: {
    margin: 16,
    marginBottom: 10,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  userInfoTextContainer: { flex: 1 },
  usernameText: { fontSize: 16, fontWeight: "bold" },
  fullNameText: { fontSize: 13, marginTop: 1 },
  emailText: { fontSize: 12, marginTop: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  toggleActiveBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },

  summaryChipsRow: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  chipItem: { alignItems: "center" },
  chipNumber: { fontSize: 15, fontWeight: "bold" },
  chipLabel: { fontSize: 11, marginTop: 2 },
  chipDivider: { width: 1, height: 24, backgroundColor: "rgba(150,150,150,0.2)" },

  segmentedBar: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    padding: 3,
    flexDirection: "row",
  },
  segmentedTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 9,
  },
  tabLabel: { fontSize: 12 },

  centerLoading: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyContainer: { paddingVertical: 40, alignItems: "center" },

  infoSectionCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  infoSectionTitle: { fontSize: 14, fontWeight: "bold", marginBottom: 10 },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  infoKey: { fontSize: 13 },
  infoVal: { fontSize: 13, fontWeight: "bold" },

  contentItemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tagBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  itemNumberText: { fontSize: 11, fontWeight: "bold" },
  itemTitleText: { fontSize: 13, fontWeight: "500" },

  contentCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  boardNameBadge: { fontSize: 11, fontWeight: "bold" },
  dateText: { fontSize: 11 },
  cardTitle: { fontSize: 14, fontWeight: "bold" },
  cardCaption: { fontSize: 12, marginTop: 4 },
});
