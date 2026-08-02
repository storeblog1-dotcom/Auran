import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
  FlatList,
  Dimensions,
  RefreshControl,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { Ionicons } from "@expo/vector-icons";
import api from "../services/api";
import { getFullImageUrl } from "../config";
import { useFocusEffect } from "@react-navigation/native";
import { PostDetailModal } from "../components/PostDetailModal";
import { FollowRequestsModal } from "../components/FollowRequestsModal";
import { getDisplayName } from "../utils/displayName";
import { AdminAvatar, AdminBadge } from "../components/AdminIdentity";

const { width, height } = Dimensions.get("window");
const DEVICE_ASPECT_RATIO = height / width;
const GRID_SIZE = width / 3;

export const ProfileScreen = ({ navigation }: any) => {
  const { user, logout, refreshProfile } = useAuth();
  const { colors, isDark, toggleTheme } = useTheme();
  const [userPosts, setUserPosts] = useState<any[]>([]);
  const [savedPosts, setSavedPosts] = useState<any[]>([]);
  const [repostedPosts, setRepostedPosts] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"my_posts" | "saved_posts" | "reposts">("my_posts");
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [requestsModalVisible, setRequestsModalVisible] = useState(false);

  const fetchUserPosts = async () => {
    if (!user) return;
    try {
      const response = await api.get(`/users/${user.username}/posts`);
      if (response.data && response.data.data) {
        setUserPosts(response.data.data);
      }
    } catch (err) {
      console.log("Error fetching user posts", err);
    }
  };

  const fetchSavedPosts = async () => {
    try {
      const response = await api.get("/users/me/saved-posts");
      if (response.data && response.data.data) {
        setSavedPosts(response.data.data);
      }
    } catch (err) {
      console.log("Error fetching saved posts", err);
    }
  };

  const fetchRepostedPosts = async () => {
    try {
      const response = await api.get("/users/me/reposted-posts");
      if (response.data && response.data.data) {
        setRepostedPosts(response.data.data);
      }
    } catch (err) {
      console.log("Error fetching reposted posts", err);
    }
  };

  const loadData = async () => {
    await refreshProfile();
    await fetchUserPosts();
    await fetchSavedPosts();
    await fetchRepostedPosts();
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [])
  );

  const handleOpenDetail = (postId: string) => {
    setSelectedPostId(postId);
    setDetailModalVisible(true);
  };

  const renderGridItem = ({ item }: { item: any }) => {
    const mainMedia = item.media && item.media.length > 0 ? item.media[0].media_url : null;
    const imageUrl = getFullImageUrl(mainMedia);

    return (
      <TouchableOpacity
        style={styles.gridItem}
        activeOpacity={0.85}
        onPress={() => handleOpenDetail(item.id)}
      >
        <View style={[styles.gridCardWrapper, { borderColor: colors.borderColor, backgroundColor: colors.bgCard }]}>
          <Image
            source={{ uri: imageUrl }}
            style={[styles.gridImage, { backgroundColor: colors.bgCard }]}
            resizeMode="cover"
          />
          {item.media && item.media.length > 1 ? (
            <View style={[styles.gridBadge, { backgroundColor: isDark ? "rgba(15, 23, 42, 0.75)" : "rgba(241, 245, 249, 0.85)" }]}>
              <Ionicons name="layers-outline" size={14} color={colors.textPrimary} />
            </View>
          ) : item.media && item.media[0]?.media_type === "video" ? (
            <View style={[styles.gridBadge, { backgroundColor: isDark ? "rgba(15, 23, 42, 0.75)" : "rgba(241, 245, 249, 0.85)" }]}>
              <Ionicons name="film-outline" size={14} color={colors.textPrimary} />
            </View>
          ) : (
            <View style={[styles.gridBadge, { backgroundColor: isDark ? "rgba(15, 23, 42, 0.75)" : "rgba(241, 245, 249, 0.85)" }]}>
              <Ionicons name="camera-outline" size={14} color={colors.textPrimary} />
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const currentGridData =
    activeTab === "my_posts"
      ? userPosts
      : activeTab === "saved_posts"
        ? savedPosts
        : repostedPosts;

  const primaryAccent = isDark ? "#38bdf8" : "#0284c7";
  const purpleAccent = isDark ? "#c084fc" : "#7c3aed";
  const cyanBorder = isDark ? "#06b6d4" : "#0284c7";
  const purpleBorder = isDark ? "#a855f7" : "#7c3aed";

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      {/* Profile Top Navigation Header */}
      <View style={[styles.header, { borderBottomColor: colors.borderColor }]}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{getDisplayName(user, "프로필")}</Text>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {/* Admin Dashboard Button (Only for admin) */}
          {user?.is_admin && (
            <TouchableOpacity
              onPress={() => navigation.navigate("Admin")}
              style={[
                styles.headerIconBtn,
                {
                  backgroundColor: isDark ? "rgba(56, 189, 248, 0.15)" : "rgba(2, 132, 199, 0.1)",
                  borderColor: primaryAccent,
                },
              ]}
              activeOpacity={0.7}
            >
              <Ionicons name="shield-checkmark-outline" size={18} color={primaryAccent} />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            accessibilityLabel="안전 센터"
            onPress={() => navigation.navigate("SafetyCenter")}
            style={[styles.headerIconBtn, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}
            activeOpacity={0.7}
          >
            <Ionicons name="shield-outline" size={18} color={primaryAccent} />
          </TouchableOpacity>

          {/* Theme Toggle Button */}
          <TouchableOpacity
            onPress={toggleTheme}
            style={[styles.headerIconBtn, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isDark ? "sunny-outline" : "moon-outline"}
              size={18}
              color={primaryAccent}
            />
          </TouchableOpacity>

          {/* Logout (Power) Button */}
          <TouchableOpacity
            style={[styles.headerIconBtn, { backgroundColor: colors.bgCard, borderColor: "rgba(239, 68, 68, 0.4)" }]}
            onPress={() => {
              Alert.alert("로그아웃", "정말로 로그아웃 하시겠습니까?", [
                { text: "취소", style: "cancel" },
                { text: "로그아웃", style: "destructive", onPress: logout },
              ]);
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="power-outline" size={18} color="#ef4444" />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={currentGridData}
        keyExtractor={(item) => item.id}
        numColumns={3}
        renderItem={renderGridItem}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primaryAccent} />
        }
        ListHeaderComponent={
          <View style={styles.profileHeroSection}>
            {/* Centered Avatar Hero with Neon Aura Ring */}
            <View style={styles.avatarHeroContainer}>
              <Text style={[styles.activeStatusBadge, { color: primaryAccent }]}>Live/Active</Text>
              <View
                style={[
                  styles.auraRingOuter,
                  {
                    borderColor: primaryAccent,
                    shadowColor: primaryAccent,
                    backgroundColor: colors.bgCard,
                  },
                ]}
              >
                <AdminAvatar
                  user={user}
                  style={styles.profileAvatarHero}
                />
              </View>
            </View>

            {/* Centered Name and Username */}
            <View style={styles.userTitleContainer}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center" }}>
                <Text style={[styles.fullNameText, { color: colors.textPrimary }]}>
                  {getDisplayName(user)}
                </Text>
                {user?.is_admin ? (
                  <AdminBadge />
                ) : (
                  <Ionicons name="checkmark-circle" size={18} color={primaryAccent} />
                )}
              </View>
              {user?.bio ? <Text style={[styles.bioSubText, { color: colors.textSecondary }]}>{user.bio}</Text> : null}
            </View>

            {/* Stats Row (Posts / Followers / Following) */}
            <View style={styles.statsRowHero}>
              <View style={styles.statBoxHero}>
                <Text style={[styles.statNumberPosts, { color: colors.textPrimary }]}>
                  {user?.posts_count || userPosts.length}
                </Text>
                <Text style={[styles.statLabelHero, { color: colors.textMuted }]}>Posts</Text>
              </View>
              <View style={styles.statBoxHero}>
                <Text style={[styles.statNumberFollowers, { color: primaryAccent }]}>
                  {user?.followers_count || 0}
                </Text>
                <Text style={[styles.statLabelHero, { color: colors.textMuted }]}>Followers</Text>
              </View>
              <View style={styles.statBoxHero}>
                <Text style={[styles.statNumberFollowing, { color: purpleAccent }]}>
                  {user?.following_count || 0}
                </Text>
                <Text style={[styles.statLabelHero, { color: colors.textMuted }]}>Following</Text>
              </View>
            </View>

            {/* Neon Pill Action Buttons */}
            <View style={styles.actionPillRow}>
              <TouchableOpacity
                style={[
                  styles.cyanPillBtn,
                  {
                    borderColor: cyanBorder,
                    backgroundColor: isDark ? "rgba(6, 182, 212, 0.12)" : "rgba(2, 132, 199, 0.08)",
                  },
                ]}
                onPress={() => navigation.navigate("EditProfile")}
                activeOpacity={0.8}
              >
                <Ionicons name="create-outline" size={18} color={cyanBorder} />
                <Text style={[styles.cyanPillBtnText, { color: cyanBorder }]}>프로필 편집</Text>
              </TouchableOpacity>

              {user?.is_private ? (
                <TouchableOpacity
                  style={[
                    styles.purplePillBtn,
                    {
                      borderColor: purpleBorder,
                      backgroundColor: isDark ? "rgba(168, 85, 247, 0.12)" : "rgba(124, 58, 237, 0.08)",
                    },
                  ]}
                  onPress={() => setRequestsModalVisible(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="mail-outline" size={18} color={purpleAccent} />
                  <Text style={[styles.purplePillBtnText, { color: purpleAccent }]}>팔로우 요청</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.purplePillBtn,
                    {
                      borderColor: purpleBorder,
                      backgroundColor: isDark ? "rgba(168, 85, 247, 0.12)" : "rgba(124, 58, 237, 0.08)",
                    },
                  ]}
                  onPress={() => navigation.navigate("MainTabs", { screen: "Messages" })}
                  activeOpacity={0.8}
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={18} color={purpleAccent} />
                  <Text style={[styles.purplePillBtnText, { color: purpleAccent }]}>메시지</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[
                  styles.squarePillIconBtn,
                  {
                    borderColor: purpleBorder,
                    backgroundColor: isDark ? "rgba(168, 85, 247, 0.12)" : "rgba(124, 58, 237, 0.08)",
                  },
                ]}
                onPress={() => setRequestsModalVisible(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="person-add-outline" size={18} color={purpleAccent} />
              </TouchableOpacity>
            </View>

            {/* Admin Dashboard Pill Banner (If Admin) */}
            {user?.is_admin && (
              <TouchableOpacity
                style={{
                  marginHorizontal: 16,
                  marginTop: 10,
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                  borderRadius: 14,
                  backgroundColor: isDark ? "rgba(168, 85, 247, 0.18)" : "rgba(124, 58, 237, 0.12)",
                  borderWidth: 1.5,
                  borderColor: primaryAccent,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
                onPress={() => navigation.navigate("Admin")}
                activeOpacity={0.8}
              >
                <Ionicons name="shield-checkmark" size={20} color={primaryAccent} />
                <Text style={{ color: primaryAccent, fontSize: 14, fontWeight: "bold" }}>
                  관리자 대시보드 (Admin Dashboard)
                </Text>
                <Ionicons name="chevron-forward" size={16} color={primaryAccent} />
              </TouchableOpacity>
            )}

            {/* Tab Bar (Photos / Saved / Reposts) */}
            <View style={[styles.neonTabBar, { borderTopColor: colors.borderColor }]}>
              <TouchableOpacity
                style={[
                  styles.neonTabItem,
                  activeTab === "my_posts" && { borderBottomColor: primaryAccent },
                ]}
                onPress={() => setActiveTab("my_posts")}
              >
                <Ionicons
                  name="images-outline"
                  size={18}
                  color={activeTab === "my_posts" ? primaryAccent : colors.textMuted}
                />
                <Text
                  style={[
                    styles.neonTabText,
                    { color: colors.textMuted },
                    activeTab === "my_posts" && { color: primaryAccent, fontWeight: "bold" },
                  ]}
                >
                  게시물
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.neonTabItem,
                  activeTab === "saved_posts" && { borderBottomColor: primaryAccent },
                ]}
                onPress={() => {
                  setActiveTab("saved_posts");
                  fetchSavedPosts();
                }}
              >
                <Ionicons
                  name="bookmark-outline"
                  size={18}
                  color={activeTab === "saved_posts" ? primaryAccent : colors.textMuted}
                />
                <Text
                  style={[
                    styles.neonTabText,
                    { color: colors.textMuted },
                    activeTab === "saved_posts" && { color: primaryAccent, fontWeight: "bold" },
                  ]}
                >
                  저장됨
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.neonTabItem,
                  activeTab === "reposts" && { borderBottomColor: primaryAccent },
                ]}
                onPress={() => {
                  setActiveTab("reposts");
                  fetchRepostedPosts();
                }}
              >
                <Ionicons
                  name="repeat-outline"
                  size={18}
                  color={activeTab === "reposts" ? primaryAccent : colors.textMuted}
                />
                <Text
                  style={[
                    styles.neonTabText,
                    { color: colors.textMuted },
                    activeTab === "reposts" && { color: primaryAccent, fontWeight: "bold" },
                  ]}
                >
                  리포스트
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyGridContainer}>
            <Ionicons
              name={
                activeTab === "my_posts"
                  ? "images-outline"
                  : activeTab === "saved_posts"
                    ? "bookmark-outline"
                    : "repeat-outline"
              }
              size={42}
              color={colors.textMuted}
              style={{ marginBottom: 12, opacity: 0.6 }}
            />
            <Text style={[styles.emptyGridText, { color: colors.textMuted }]}>
              {activeTab === "my_posts"
                ? "작성한 게시물이 없습니다."
                : activeTab === "saved_posts"
                  ? "저장한 게시물이 없습니다."
                  : "리포스트한 게시물이 없습니다."}
            </Text>
          </View>
        }
      />

      {/* Post Detail Modal */}
      <PostDetailModal
        visible={detailModalVisible}
        postId={selectedPostId}
        onClose={() => {
          setDetailModalVisible(false);
          setSelectedPostId(null);
        }}
        onPostUpdated={loadData}
      />

      {/* Follow Requests Modal */}
      <FollowRequestsModal
        visible={requestsModalVisible}
        onClose={() => setRequestsModalVisible(false)}
        onRequestHandled={loadData}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#080b18",
  },
  header: {
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#f8fafc",
    letterSpacing: 0.5,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  profileHeroSection: {
    alignItems: "center",
    paddingTop: 16,
    paddingBottom: 10,
  },
  avatarHeroContainer: {
    alignItems: "center",
    marginBottom: 12,
  },
  activeStatusBadge: {
    fontSize: 11,
    fontWeight: "700",
    color: "#38bdf8",
    letterSpacing: 1,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  auraRingOuter: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 3,
    borderColor: "#38bdf8",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#38bdf8",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 16,
    elevation: 10,
    backgroundColor: "#0f172a",
  },
  profileAvatarHero: {
    width: 92,
    height: 92,
    borderRadius: 46,
  },
  userTitleContainer: {
    alignItems: "center",
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  fullNameText: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#ffffff",
    letterSpacing: 0.3,
  },
  usernameSubText: {
    fontSize: 14,
    color: "#94a3b8",
    marginTop: 2,
    fontWeight: "500",
  },
  bioSubText: {
    fontSize: 13,
    lineHeight: 20,
    color: "#cbd5e1",
    marginTop: 6,
    textAlign: "center",
  },
  statsRowHero: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  statBoxHero: {
    alignItems: "center",
    flex: 1,
  },
  statNumberPosts: {
    fontSize: 22,
    fontWeight: "800",
    color: "#ffffff",
  },
  statNumberFollowers: {
    fontSize: 22,
    fontWeight: "800",
    color: "#38bdf8",
  },
  statNumberFollowing: {
    fontSize: 22,
    fontWeight: "800",
    color: "#c084fc",
  },
  statLabelHero: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    marginTop: 2,
  },
  actionPillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 20,
    width: "100%",
  },
  cyanPillBtn: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: "#06b6d4",
    backgroundColor: "rgba(6, 182, 212, 0.12)",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  cyanPillBtnText: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#06b6d4",
  },
  purplePillBtn: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: "#a855f7",
    backgroundColor: "rgba(168, 85, 247, 0.12)",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  purplePillBtnText: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#c084fc",
  },
  squarePillIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: "#a855f7",
    backgroundColor: "rgba(168, 85, 247, 0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  neonTabBar: {
    flexDirection: "row",
    width: "100%",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    paddingTop: 10,
  },
  neonTabItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  neonTabItemActive: {
    borderBottomColor: "#38bdf8",
  },
  neonTabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748b",
  },
  neonTabTextActive: {
    color: "#38bdf8",
    fontWeight: "bold",
  },
  gridItem: {
    width: GRID_SIZE,
    height: GRID_SIZE * 1.2,
    padding: 4,
  },
  gridCardWrapper: {
    width: "100%",
    height: "100%",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "rgba(56, 189, 248, 0.2)",
    overflow: "hidden",
    backgroundColor: "#0f172a",
    position: "relative",
  },
  gridImage: {
    width: "100%",
    height: "100%",
  },
  gridBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    padding: 4,
    borderRadius: 8,
  },
  emptyGridContainer: {
    width: "100%",
    paddingVertical: 60,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyGridText: {
    color: "#64748b",
    fontSize: 15,
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 22,
  },
});

