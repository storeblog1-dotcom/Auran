import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
  FlatList,
  Dimensions,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import api from "../services/api";
import { getFullImageUrl } from "../config";
import { PostDetailModal } from "../components/PostDetailModal";
import { UserListModal } from "../components/UserListModal";
import { getDisplayName } from "../utils/displayName";
import { ReportSheet } from "../components/ReportSheet";
import { AdminAvatar, AdminBadge } from "../components/AdminIdentity";

const { width, height } = Dimensions.get("window");
const DEVICE_ASPECT_RATIO = height / width;
const GRID_SIZE = width / 3;

export const UserProfileScreen = ({ route, navigation }: any) => {
  const { username } = route.params || {};
  const { colors, isDark } = useTheme();
  const [profile, setProfile] = useState<any | null>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [repostedPosts, setRepostedPosts] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"posts" | "reposts">("posts");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Post Detail Modal
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);

  // User List Modal (Followers / Following)
  const [userListModalVisible, setUserListModalVisible] = useState(false);
  const [userListType, setUserListType] = useState<"followers" | "following">("followers");

  const fetchProfileData = async () => {
    if (!username) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const [profileRes, postsRes, repostsRes] = await Promise.all([
        api.get(`/users/${username}`),
        api.get(`/users/${username}/posts`),
        api.get(`/users/${username}/reposted-posts`),
      ]);

      if (profileRes.data && profileRes.data.data) {
        setProfile(profileRes.data.data);
      }
      if (postsRes.data && postsRes.data.data) {
        setPosts(postsRes.data.data);
      }
      if (repostsRes.data && repostsRes.data.data) {
        setRepostedPosts(repostsRes.data.data);
      }
    } catch (err: any) {
      console.log("Error fetching user profile", err);
      if (err.response?.status === 403) {
        Alert.alert(
          "관리자 계정",
          err.response?.data?.error?.message ||
            err.response?.data?.detail ||
            "관리자 계정의 프로필은 공개되지 않습니다.",
          [{ text: "확인", onPress: () => navigation.goBack() }]
        );
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const safetyTimeout = setTimeout(() => setLoading(false), 2000);
    fetchProfileData().finally(() => clearTimeout(safetyTimeout));
    return () => clearTimeout(safetyTimeout);
  }, [username]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchProfileData();
  };

  const handleToggleFollow = async () => {
    if (!profile) return;
    const currentIsFollowing = profile.is_following;
    const nextIsFollowing = !currentIsFollowing;
    const nextFollowersCount = nextIsFollowing
      ? (profile.followers_count || 0) + 1
      : Math.max(0, (profile.followers_count || 0) - 1);

    setProfile({
      ...profile,
      is_following: nextIsFollowing,
      followers_count: nextFollowersCount,
    });

    try {
      let response;
      if (currentIsFollowing) {
        response = await api.delete(`/users/${username}/follow`);
      } else {
        response = await api.post(`/users/${username}/follow`);
      }
      const result = response.data?.data;
      setProfile((prev: any) =>
        prev
          ? {
              ...prev,
              is_following: result?.is_following ?? nextIsFollowing,
              followers_count: result?.followers_count ?? nextFollowersCount,
            }
          : prev
      );
    } catch (err) {
      console.log("Error toggling follow in UserProfileScreen", err);
      fetchProfileData();
    }
  };

  const handleStartDirectMessage = async () => {
    if (!profile) return;
    try {
      const res = await api.post("/direct/rooms", {
        target_user_id: profile.id,
      });
      const room = res.data?.data || res.data;
      navigation.navigate("MainTabs", {
        screen: "Messages",
        params: {
          screen: "ChatRoom",
          params: {
            roomId: room.id,
            requestStatus: room.request_status,
            isOutgoingRequest: room.is_outgoing_request,
            targetUser: {
              id: profile.id,
              username: profile.username,
              nickname: profile.nickname,
              full_name: profile.full_name,
              profile_image_url: profile.profile_image_url,
              is_admin: profile.is_admin,
            },
          },
        },
      });
    } catch (err: any) {
      console.log("Error starting chat from UserProfileScreen", err);
      Alert.alert(
        "메시지를 보낼 수 없음",
        err.response?.data?.error?.message ||
          err.response?.data?.detail ||
          "메시지를 보낼 수 없습니다."
      );
    }
  };

  const openUserListModal = (type: "followers" | "following") => {
    setUserListType(type);
    setUserListModalVisible(true);
  };

  const renderGridItem = ({ item }: { item: any }) => {
    const mainMedia = item.media && item.media.length > 0 ? item.media[0].media_url : null;
    const imageUrl = getFullImageUrl(mainMedia);

    return (
      <TouchableOpacity
        style={styles.gridItem}
        activeOpacity={0.85}
        onPress={() => {
          setSelectedPostId(item.id);
          setDetailModalVisible(true);
        }}
      >
        <View style={styles.gridCardWrapper}>
          <Image source={{ uri: imageUrl }} style={styles.gridImage} resizeMode="cover" />
          {item.media && item.media.length > 1 ? (
            <View style={styles.gridBadge}>
              <Ionicons name="layers-outline" size={14} color="#fff" />
            </View>
          ) : item.media && item.media[0]?.media_type === "video" ? (
            <View style={styles.gridBadge}>
              <Ionicons name="film-outline" size={14} color="#fff" />
            </View>
          ) : (
            <View style={styles.gridBadge}>
              <Ionicons name="camera-outline" size={14} color="#fff" />
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const primaryAccent = isDark ? "#38bdf8" : "#0284c7";
  const purpleAccent = isDark ? "#c084fc" : "#7c3aed";
  const cyanBorder = isDark ? "#06b6d4" : "#0284c7";
  const purpleBorder = isDark ? "#a855f7" : "#7c3aed";

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      {/* Top Header */}
      <View style={[styles.header, { borderBottomColor: colors.borderColor }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{getDisplayName(profile, "프로필")}</Text>
        <TouchableOpacity style={{ padding: 6 }} onPress={() => setReportVisible(true)}>
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {loading || !profile ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={primaryAccent} />
        </View>
      ) : (
        <FlatList
          data={activeTab === "posts" ? posts : repostedPosts}
          keyExtractor={(item) => item.id}
          numColumns={3}
          renderItem={renderGridItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primaryAccent} />
          }
          ListHeaderComponent={
            <View style={styles.profileHeroSection}>
              {/* Centered Avatar Hero with Neon Ring */}
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
                    user={profile}
                    style={styles.profileAvatarHero}
                  />
                </View>
              </View>

              {/* Centered Name and Username */}
              <View style={styles.userTitleContainer}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center" }}>
                  <Text style={[styles.fullNameText, { color: colors.textPrimary }]}>
                    {getDisplayName(profile)}
                  </Text>
                  {profile.is_admin ? (
                    <AdminBadge />
                  ) : (
                    <Ionicons name="checkmark-circle" size={18} color={primaryAccent} />
                  )}
                </View>
                {profile.bio ? <Text style={[styles.bioSubText, { color: colors.textSecondary }]}>{profile.bio}</Text> : null}
              </View>

              {/* Stats Row */}
              <View style={styles.statsRowHero}>
                <View style={styles.statBoxHero}>
                  <Text style={[styles.statNumberPosts, { color: colors.textPrimary }]}>
                    {profile.posts_count || posts.length}
                  </Text>
                  <Text style={[styles.statLabelHero, { color: colors.textMuted }]}>Posts</Text>
                </View>
                <TouchableOpacity
                  style={styles.statBoxHero}
                  onPress={() => openUserListModal("followers")}
                >
                  <Text style={[styles.statNumberFollowers, { color: primaryAccent }]}>
                    {profile.followers_count || 0}
                  </Text>
                  <Text style={[styles.statLabelHero, { color: colors.textMuted }]}>Followers</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.statBoxHero}
                  onPress={() => openUserListModal("following")}
                >
                  <Text style={[styles.statNumberFollowing, { color: purpleAccent }]}>
                    {profile.following_count || 0}
                  </Text>
                  <Text style={[styles.statLabelHero, { color: colors.textMuted }]}>Following</Text>
                </TouchableOpacity>
              </View>

              {/* Action Buttons */}
              {!profile.is_me ? (
                <View style={styles.actionPillRow}>
                  <TouchableOpacity
                    style={[
                      styles.cyanPillBtn,
                      {
                        borderColor: cyanBorder,
                        backgroundColor: isDark ? "rgba(6, 182, 212, 0.12)" : "rgba(2, 132, 199, 0.08)",
                      },
                      profile.is_following && styles.cyanPillBtnFollowing,
                    ]}
                    onPress={handleToggleFollow}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={profile.is_following ? "checkmark" : "person-add-outline"}
                      size={18}
                      color={profile.is_following ? colors.textMuted : cyanBorder}
                    />
                    <Text
                      style={[
                        styles.cyanPillBtnText,
                        { color: cyanBorder },
                        profile.is_following && { color: colors.textMuted },
                      ]}
                    >
                      {profile.is_following ? "팔로잉" : "+ Follow"}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.purplePillBtn,
                      {
                        borderColor: purpleBorder,
                        backgroundColor: isDark ? "rgba(168, 85, 247, 0.12)" : "rgba(124, 58, 237, 0.08)",
                      },
                    ]}
                    onPress={handleStartDirectMessage}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={18} color={purpleAccent} />
                    <Text style={[styles.purplePillBtnText, { color: purpleAccent }]}>Message</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.squarePillIconBtn,
                      {
                        borderColor: purpleBorder,
                        backgroundColor: isDark ? "rgba(168, 85, 247, 0.12)" : "rgba(124, 58, 237, 0.08)",
                      },
                    ]}
                    onPress={() => openUserListModal("followers")}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="people-outline" size={18} color={purpleAccent} />
                  </TouchableOpacity>
                </View>
              ) : null}

              {/* Tab Bar (Photos / Reposts) */}
              <View style={[styles.neonTabBar, { borderTopColor: colors.borderColor }]}>
                <TouchableOpacity
                  style={[
                    styles.neonTabItem,
                    activeTab === "posts" && { borderBottomColor: primaryAccent },
                  ]}
                  onPress={() => setActiveTab("posts")}
                >
                  <Ionicons
                    name="images-outline"
                    size={18}
                    color={activeTab === "posts" ? primaryAccent : colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.neonTabText,
                      { color: colors.textMuted },
                      activeTab === "posts" && { color: primaryAccent, fontWeight: "bold" },
                    ]}
                  >
                    Photos
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.neonTabItem,
                    activeTab === "reposts" && { borderBottomColor: primaryAccent },
                  ]}
                  onPress={() => setActiveTab("reposts")}
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
                    Reposts
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyGridContainer}>
              <Text style={[styles.emptyGridText, { color: colors.textMuted }]}>
                {activeTab === "posts" ? "게시물이 없습니다." : "리포스트한 게시물이 없습니다."}
              </Text>
            </View>
          }
        />
      )}

      {/* Post Detail Modal */}
      <PostDetailModal
        visible={detailModalVisible}
        postId={selectedPostId}
        onClose={() => {
          setDetailModalVisible(false);
          setSelectedPostId(null);
        }}
        onPostUpdated={fetchProfileData}
      />
      <ReportSheet
        visible={reportVisible}
        targetType="profile"
        targetId={profile?.id || null}
        targetUsername={profile?.username}
        onClose={() => setReportVisible(false)}
        onHidden={() => navigation.goBack()}
      />

      {/* User List Modal (Followers / Following) */}
      <UserListModal
        visible={userListModalVisible}
        username={username}
        type={userListType}
        onClose={() => setUserListModalVisible(false)}
        onSelectUser={(selectedUsername) => {
          if (selectedUsername !== username) {
            navigation.push("UserProfile", { username: selectedUsername });
          }
        }}
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
  backBtn: {
    padding: 6,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#f8fafc",
    letterSpacing: 0.5,
  },
  center: {
    flex: 1,
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
  cyanPillBtnFollowing: {
    borderColor: "#475569",
    backgroundColor: "rgba(71, 85, 105, 0.2)",
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
    padding: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyGridText: {
    color: "#64748b",
    fontSize: 15,
  },
});
