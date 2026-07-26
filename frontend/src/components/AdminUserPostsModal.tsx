import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  Image,
  FlatList,
  ActivityIndicator,
  Dimensions,
  SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import api from "../services/api";
import { getFullImageUrl } from "../config";
import { AdminUserItem } from "../services/adminService";
import { PostDetailModal } from "./PostDetailModal";

const { width } = Dimensions.get("window");
const GRID_ITEM_SIZE = (width - 44) / 3;

interface AdminUserPostsModalProps {
  visible: boolean;
  user: AdminUserItem | null;
  onClose: () => void;
}

export const AdminUserPostsModal: React.FC<AdminUserPostsModalProps> = ({
  visible,
  user,
  onClose,
}) => {
  const { colors, isDark } = useTheme();
  const [posts, setPosts] = useState<any[]>([]);
  const [totalPostsCount, setTotalPostsCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);

  // Selected post for detail modal
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [postDetailModalVisible, setPostDetailModalVisible] = useState<boolean>(false);

  const primaryAccent = isDark ? "#a855f7" : "#7c3aed";

  const fetchUserPosts = async (username: string) => {
    setLoading(true);
    try {
      const res = await api.get(`/users/${username}/posts`, { params: { size: 100 } });
      if (res.data) {
        setPosts(res.data.data || []);
        const total =
          res.data.meta?.total ??
          res.data.pagination?.total ??
          (res.data.data ? res.data.data.length : 0);
        setTotalPostsCount(total);
      }
    } catch (err) {
      console.log("Failed to fetch user posts for admin modal", err);
    } finally {
      setLoading(false);
    }
  };

  const getMediaUrl = (item: any): string | null => {
    if (!item) return null;
    if (item.media && Array.isArray(item.media) && item.media.length > 0) {
      const first = item.media[0];
      return first.media_url || first.url || first.image_url || null;
    }
    if (item.media_url) return item.media_url;
    if (item.image_url) return item.image_url;
    return null;
  };

  useEffect(() => {
    if (visible && user?.username) {
      fetchUserPosts(user.username);
    } else {
      setPosts([]);
      setTotalPostsCount(0);
    }
  }, [visible, user]);

  if (!visible || !user) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.borderColor }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            회원 정보 및 게시물 관리
          </Text>
          <View style={{ width: 32 }} />
        </View>

        {/* User Info Card */}
        <View style={[styles.userProfileCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
          <Image
            source={{ uri: getFullImageUrl(user.profile_image_url) }}
            style={styles.avatar}
          />
          <View style={styles.userInfoTextContainer}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={[styles.usernameText, { color: colors.textPrimary }]}>@{user.username}</Text>
              {user.is_admin && (
                <View style={styles.adminBadge}>
                  <Text style={styles.adminBadgeText}>관리자</Text>
                </View>
              )}
            </View>
            <Text style={[styles.fullNameText, { color: colors.textMuted }]}>{user.full_name}</Text>
            <Text style={[styles.emailText, { color: colors.textMuted }]}>{user.email}</Text>
          </View>

          {/* Status Badge */}
          <View style={{ alignItems: "flex-end" }}>
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
          </View>
        </View>

        {/* Total Posts Stat Banner */}
        <View
          style={[
            styles.statBanner,
            {
              backgroundColor: isDark ? "rgba(168, 85, 247, 0.15)" : "rgba(124, 58, 237, 0.08)",
              borderColor: primaryAccent,
            },
          ]}
        >
          <Ionicons name="documents-outline" size={22} color={primaryAccent} />
          <Text style={[styles.statBannerLabel, { color: colors.textPrimary }]}>
            작성한 총 게시물
          </Text>
          <View style={[styles.statCountBadge, { backgroundColor: primaryAccent }]}>
            <Text style={styles.statCountText}>{totalPostsCount}개</Text>
          </View>
        </View>

        {/* Section Header */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            🖼️ 게시물 목록 ({posts.length})
          </Text>
          <Text style={[styles.sectionSub, { color: colors.textMuted }]}>
            게시물을 터치하면 원본 크기 및 상세 팝업창이 나타납니다.
          </Text>
        </View>

        {/* Posts Grid List */}
        {loading ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color={primaryAccent} />
          </View>
        ) : posts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="images-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              작성된 게시물이 없습니다.
            </Text>
          </View>
        ) : (
          <FlatList
            data={posts}
            keyExtractor={(item) => item.id}
            numColumns={3}
            contentContainerStyle={styles.gridContainer}
            renderItem={({ item }) => {
              const mediaUrl = getMediaUrl(item);
              return (
                <TouchableOpacity
                  style={[styles.gridItem, { backgroundColor: colors.bgCard }]}
                  activeOpacity={0.8}
                  onPress={() => {
                    setSelectedPostId(item.id);
                    setPostDetailModalVisible(true);
                  }}
                >
                  {mediaUrl ? (
                    <Image
                      source={{ uri: getFullImageUrl(mediaUrl) }}
                      style={styles.gridImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.gridNoImage, { backgroundColor: colors.bgCard }]}>
                      <Ionicons name="document-text-outline" size={24} color={colors.textMuted} style={{ marginBottom: 4 }} />
                      <Text style={[styles.gridCaptionText, { color: colors.textPrimary }]} numberOfLines={2}>
                        {item.caption || "(내용 없음)"}
                      </Text>
                    </View>
                  )}
                  {/* Multiple Media Badge */}
                  {item.media && item.media.length > 1 && (
                    <View style={styles.gridBadgeContainer}>
                      <Ionicons name="copy" size={12} color="#fff" style={styles.badgeIcon} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        )}

        {/* Nested Post Detail Popup */}
        <PostDetailModal
          visible={postDetailModalVisible}
          postId={selectedPostId}
          onClose={() => setPostDetailModalVisible(false)}
          onPostUpdated={() => fetchUserPosts(user.username)}
        />
      </SafeAreaView>
    </Modal>
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
  closeBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "bold",
  },
  userProfileCard: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#ccc",
  },
  userInfoTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  usernameText: {
    fontSize: 15,
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
    marginTop: 2,
  },
  emailText: {
    fontSize: 11,
    marginTop: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statBanner: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  statBannerLabel: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    fontWeight: "600",
  },
  statCountBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statCountText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  sectionHeader: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "bold",
  },
  sectionSub: {
    fontSize: 11,
    marginTop: 2,
  },
  centerLoading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 40,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 14,
  },
  gridContainer: {
    paddingHorizontal: 14,
    paddingBottom: 24,
  },
  gridItem: {
    width: GRID_ITEM_SIZE,
    height: GRID_ITEM_SIZE,
    margin: 2,
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
  },
  gridImage: {
    width: "100%",
    height: "100%",
  },
  gridNoImage: {
    width: "100%",
    height: "100%",
    padding: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  gridCaptionText: {
    fontSize: 11,
    textAlign: "center",
  },
  gridBadgeContainer: {
    position: "absolute",
    top: 4,
    right: 4,
  },
  badgeIcon: {
    textShadowColor: "rgba(0, 0, 0, 0.6)",
    textShadowRadius: 3,
  },
});
