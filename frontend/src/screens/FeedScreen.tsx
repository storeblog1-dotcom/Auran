import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
  Alert,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import api from "../services/api";
import { getDisplayName } from "../utils/displayName";
import { CommentsModal } from "../components/CommentsModal";
import { StoryBar } from "../components/StoryBar";
import { StoryViewerModal } from "../components/StoryViewerModal";
import { CreateStoryModal } from "../components/CreateStoryModal";
import { NotificationsModal } from "../components/NotificationsModal";
import { SendPostDmModal } from "../components/SendPostDmModal";
import { MyStoriesGridModal } from "../components/MyStoriesGridModal";
import { PostCarousel } from "../components/PostCarousel";
import { VerifiedYouTubeCard } from "../components/VerifiedYouTubeCard";
import { HashtagText } from "../components/HashtagText";
import { PostDetailModal } from "../components/PostDetailModal";
import { NoticeListModal } from "../components/NoticeListModal";
import { AuraLogoText } from "../components/AuraLogoText";
import { PostOptionsSheet } from "../components/PostOptionsSheet";
import { ReportSheet } from "../components/ReportSheet";
import { useNotification } from "../context/NotificationContext";
import { Ionicons } from "@expo/vector-icons";
import {
  AdminAvatar,
  AdminBadge,
  openUserProfile,
} from "../components/AdminIdentity";

const { width, height } = Dimensions.get("window");
const FRESH_TTL = 30_000; // 30 seconds

export interface FeedPostItem {
  id: string;
  display_number?: number;
  user_id?: string;
  title?: string | null;
  caption?: string | null;
  likes_count?: number;
  comments_count?: number;
  reposts_count?: number;
  is_liked?: boolean;
  is_bookmarked?: boolean;
  is_reposted?: boolean;
  is_mine?: boolean;
  user?: any;
  media?: any[];
  youtube_url?: string | null;
  youtube_title?: string | null;
  youtube_thumbnail_url?: string | null;
  visibility?: string;
  location?: string | null;
  created_at: string;
  updated_at: string;
  preview_comments?: any[];
}

export interface StoryGroupItem {
  user_id: string;
  username: string;
  is_self?: boolean;
  stories: any[];
}

const areFeedPostsEqual = (prev: FeedPostItem[], next: FeedPostItem[]): boolean => {
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i++) {
    const a = prev[i];
    const b = next[i];
    if (
      a.id !== b.id ||
      a.likes_count !== b.likes_count ||
      a.comments_count !== b.comments_count ||
      a.reposts_count !== b.reposts_count ||
      a.is_liked !== b.is_liked ||
      a.is_bookmarked !== b.is_bookmarked ||
      a.is_reposted !== b.is_reposted ||
      a.user?.is_following !== b.user?.is_following
    ) {
      return false;
    }
  }
  return true;
};

// ─── Standalone Feed Post Card ──────────────
const FeedPostCard = React.memo(
  ({
    item,
    colors,
    currentUser,
    navigation,
    onToggleLike,
    onOpenComments,
    onToggleRepost,
    onOpenDm,
    onToggleBookmark,
    onToggleFollowUser,
    onMoreOptions,
    onDetailPress,
    onDeletePost,
  }: {
    item: FeedPostItem;
    colors: any;
    currentUser: any;
    navigation: any;
    onToggleLike: (id: string) => void;
    onOpenComments: (id: string) => void;
    onToggleRepost: (id: string) => void;
    onOpenDm: (item: FeedPostItem) => void;
    onToggleBookmark: (id: string) => void;
    onToggleFollowUser: (username: string, isFollowing: boolean) => void;
    onMoreOptions: (item: FeedPostItem) => void;
    onDetailPress: (id: string) => void;
    onDeletePost: (id: string) => void;
  }) => {
    const commentsCount = item.comments_count || 0;
    const isMe = currentUser && currentUser.username === item.user?.username;
    const isFollowing = item.user?.is_following || false;

    return (
      <LinearGradient
        colors={["rgba(139, 92, 246, 0.50)", "rgba(236, 72, 153, 0.50)", "rgba(6, 182, 212, 0.50)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.postCardGradientBorder}
      >
        <View style={[styles.postCardInner, { backgroundColor: colors.bgCard || "#161622" }]}>
          {/* Post Header */}
          <View style={styles.postHeader}>
            <TouchableOpacity
              style={styles.userInfo}
              onPress={() => openUserProfile(navigation, item.user)}
            >
              <AdminAvatar user={item.user} style={styles.avatar} />
              <View style={styles.authorText}>
                <View style={styles.authorLine}>
                  <Text style={[styles.username, { color: colors.textPrimary }]}>{getDisplayName(item.user)}</Text>
                  {item.user?.is_admin && <AdminBadge />}
                  {!isMe && (
                    <TouchableOpacity
                      style={[styles.headerFollowBtn, { backgroundColor: colors.bgInput, borderColor: colors.borderColor }]}
                      onPress={() => onToggleFollowUser(item.user?.username, isFollowing)}
                    >
                      <Text style={[styles.headerFollowBtnText, { color: colors.textPrimary }]}>
                        {isFollowing ? "팔로잉" : "팔로우"}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                {item.location ? <Text style={[styles.location, { color: colors.textSecondary }]}>{item.location}</Text> : null}
              </View>
            </TouchableOpacity>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {isMe && (
                <>
                  <TouchableOpacity
                    style={{ padding: 4 }}
                    onPress={() => navigation.navigate("CreatePost", { editPost: item })}
                  >
                    <Ionicons name="create-outline" size={20} color={colors.accentPurple || "#a855f7"} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ padding: 4 }}
                    onPress={() => {
                      Alert.alert("게시물 삭제", "정말 삭제하시겠습니까?", [
                        { text: "취소", style: "cancel" },
                        {
                          text: "삭제",
                          style: "destructive",
                          onPress: () => onDeletePost(item.id),
                        },
                      ]);
                    }}
                  >
                    <Ionicons name="trash-outline" size={20} color="#ef4444" />
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity style={{ padding: 4 }} onPress={() => onMoreOptions(item)}>
                <Ionicons name="ellipsis-horizontal" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Post Image Media Carousel */}
          {item.media && item.media.length > 0 ? (
            <PostCarousel media={item.media} onPress={() => onDetailPress(item.id)} />
          ) : !item.youtube_url ? (
            <TouchableOpacity
              style={[styles.postImage, styles.noMedia, { backgroundColor: colors.bgCard }]}
              onPress={() => onDetailPress(item.id)}
            >
              <Text style={{ color: colors.textMuted }}>이미지 없음</Text>
            </TouchableOpacity>
          ) : null}

          {/* Action Row */}
          <View style={styles.actionRow}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              {/* Likes */}
              <TouchableOpacity
                style={styles.actionCountGroup}
                onPress={() => onToggleLike(item.id)}
              >
                <Ionicons
                  name={item.is_liked ? "heart" : "heart-outline"}
                  size={24}
                  color={item.is_liked ? "#ed4956" : colors.textPrimary}
                />
                <Text style={[styles.actionCountText, { color: colors.textPrimary }]}>{item.likes_count || 0}</Text>
              </TouchableOpacity>

              {/* Comments */}
              <TouchableOpacity
                style={styles.actionCountGroup}
                onPress={() => onOpenComments(item.id)}
              >
                <Ionicons name="chatbubble-outline" size={22} color={colors.textPrimary} />
                <Text style={[styles.actionCountText, { color: colors.textPrimary }]}>{commentsCount}</Text>
              </TouchableOpacity>

              {/* Repost */}
              <TouchableOpacity style={styles.actionCountGroup} onPress={() => onToggleRepost(item.id)}>
                <Ionicons
                  name="repeat-outline"
                  size={23}
                  color={item.is_reposted ? "#10b981" : colors.textPrimary}
                />
                <Text style={[styles.actionCountText, { color: item.is_reposted ? "#10b981" : colors.textPrimary }]}>
                  {item.reposts_count || 0}
                </Text>
              </TouchableOpacity>

              {/* Send by DM */}
              <TouchableOpacity style={styles.actionCountGroup} onPress={() => onOpenDm(item)}>
                <Ionicons name="paper-plane-outline" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Bookmark Button */}
            <TouchableOpacity onPress={() => onToggleBookmark(item.id)}>
              <Ionicons
                name={item.is_bookmarked ? "bookmark" : "bookmark-outline"}
                size={23}
                color={colors.textPrimary}
              />
            </TouchableOpacity>
          </View>

          {/* Caption & Details Section */}
          <View style={styles.postDetails}>
            {item.caption ? (
              <View style={[styles.captionBlock, { paddingVertical: 6, paddingHorizontal: 0 }]}>
                <HashtagText text={item.caption} style={{ fontSize: 14, lineHeight: 20 }} />
              </View>
            ) : null}

            <VerifiedYouTubeCard
              url={item.youtube_url}
              title={item.youtube_title}
              thumbnailUrl={item.youtube_thumbnail_url}
            />

            {/* Created Date */}
            <Text style={[styles.timeText, { color: colors.textMuted, marginTop: 4 }]}>
              {new Date(item.created_at).toLocaleDateString("ko-KR")}
            </Text>
          </View>
        </View>
      </LinearGradient>
    );
  }
);

// ─── Main Feed Screen ──────────────
export const FeedScreen = ({ navigation }: any) => {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { unreadCount } = useNotification();

  const [posts, setPosts] = useState<FeedPostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Modal States
  const [notificationsModalVisible, setNotificationsModalVisible] = useState<boolean>(false);
  const [dmPost, setDmPost] = useState<FeedPostItem | null>(null);
  const [dmModalVisible, setDmModalVisible] = useState<boolean>(false);
  const [detailPostId, setDetailPostId] = useState<string | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState<boolean>(false);
  const [noticeModalVisible, setNoticeModalVisible] = useState<boolean>(false);
  const [optionsPost, setOptionsPost] = useState<FeedPostItem | null>(null);
  const [reportPost, setReportPost] = useState<FeedPostItem | null>(null);

  // Story States
  const [storyGroups, setStoryGroups] = useState<StoryGroupItem[]>([]);
  const [selectedStoryGroupIndex, setSelectedStoryGroupIndex] = useState<number>(0);
  const [storyViewerVisible, setStoryViewerVisible] = useState<boolean>(false);
  const [createStoryVisible, setCreateStoryVisible] = useState<boolean>(false);
  const [myStoriesGridVisible, setMyStoriesGridVisible] = useState<boolean>(false);

  // High-performance timestamps & locks per user
  const feedUpdatedAtRef = useRef<number>(0);
  const storiesUpdatedAtRef = useRef<number>(0);
  const inFlightFeedRef = useRef<boolean>(false);
  const inFlightStoriesRef = useRef<boolean>(false);
  const lastUserIdRef = useRef<string | undefined>(user?.id);

  // Check user change & reset
  useEffect(() => {
    if (lastUserIdRef.current !== user?.id) {
      lastUserIdRef.current = user?.id;
      feedUpdatedAtRef.current = 0;
      storiesUpdatedAtRef.current = 0;
      setPosts([]);
      setStoryGroups([]);
      setLoading(true);
    }
  }, [user?.id]);

  const fetchStories = async (force: boolean = false) => {
    const now = Date.now();
    if (!force && now - storiesUpdatedAtRef.current < FRESH_TTL && storyGroups.length > 0) {
      return;
    }
    if (inFlightStoriesRef.current) return;
    inFlightStoriesRef.current = true;

    try {
      const response = await api.get("/stories/feed");
      if (response.data && response.data.data) {
        setStoryGroups(response.data.data);
        storiesUpdatedAtRef.current = Date.now();
      }
    } catch (err) {
      console.log("Error fetching stories feed", err);
    } finally {
      inFlightStoriesRef.current = false;
    }
  };

  const fetchFeed = async (force: boolean = false) => {
    const now = Date.now();
    const isFresh = now - feedUpdatedAtRef.current < FRESH_TTL;
    const hasData = posts.length > 0;

    console.log(`[FEED_PERF] focus fetchFeed - now=${now}, isFresh=${isFresh}, hasData=${hasData}`);

    if (!force && isFresh && hasData) {
      // Very fresh (<30s) -> Skip API call completely!
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (inFlightFeedRef.current) return;
    inFlightFeedRef.current = true;

    if (hasData && !force) {
      setBackgroundRefreshing(true);
    } else if (!hasData) {
      setLoading(true);
    }

    try {
      const response = await api.get("/posts/feed");
      if (response.data) {
        const feedItems: FeedPostItem[] = response.data.data || (Array.isArray(response.data) ? response.data : []);
        
        // Shallow reconciliation check before calling setPosts!
        setPosts((prevPosts) => {
          if (areFeedPostsEqual(prevPosts, feedItems)) {
            console.log("[FEED_PERF] Posts identical, skipping setPosts state update!");
            return prevPosts;
          }
          console.log("[FEED_PERF] Feed updated with new data, committing setPosts.");
          return feedItems;
        });

        feedUpdatedAtRef.current = Date.now();
      }
    } catch (err) {
      console.log("Error fetching feed", err);
    } finally {
      inFlightFeedRef.current = false;
      setLoading(false);
      setRefreshing(false);
      setBackgroundRefreshing(false);
    }
  };

  useEffect(() => {
    fetchFeed();
    fetchStories();

    const unsubscribe = navigation.addListener("focus", () => {
      fetchFeed();
      fetchStories();
    });
    return () => {
      unsubscribe();
    };
  }, [navigation]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchFeed(true);
    fetchStories(true);
  };

  const handleToggleLike = useCallback(async (postId: string) => {
    setPosts((prevPosts) =>
      prevPosts.map((p) => {
        if (p.id === postId) {
          const nextIsLiked = !p.is_liked;
          const nextLikesCount = nextIsLiked
            ? (p.likes_count || 0) + 1
            : Math.max(0, (p.likes_count || 0) - 1);
          return { ...p, is_liked: nextIsLiked, likes_count: nextLikesCount };
        }
        return p;
      })
    );

    try {
      const res = await api.post(`/posts/${postId}/like`);
      if (res.data && res.data.data) {
        const { is_liked, likes_count } = res.data.data;
        setPosts((prevPosts) =>
          prevPosts.map((p) => (p.id === postId ? { ...p, is_liked, likes_count } : p))
        );
      }
    } catch (err) {
      console.log("Error toggling like", err);
      fetchFeed(true);
    }
  }, []);

  const handleToggleBookmark = useCallback(async (postId: string) => {
    setPosts((prevPosts) =>
      prevPosts.map((p) =>
        p.id === postId ? { ...p, is_bookmarked: !p.is_bookmarked } : p
      )
    );

    try {
      const res = await api.post(`/posts/${postId}/bookmark`);
      if (res.data && res.data.data) {
        const { is_bookmarked } = res.data.data;
        setPosts((prevPosts) =>
          prevPosts.map((p) => (p.id === postId ? { ...p, is_bookmarked } : p))
        );
      }
    } catch (err) {
      console.log("Error toggling bookmark", err);
      fetchFeed(true);
    }
  }, []);

  const handleToggleRepost = useCallback(async (postId: string) => {
    setPosts((prevPosts) =>
      prevPosts.map((p) => {
        if (p.id === postId) {
          const nextIsReposted = !p.is_reposted;
          const nextCount = nextIsReposted
            ? (p.reposts_count || 0) + 1
            : Math.max(0, (p.reposts_count || 0) - 1);
          return { ...p, is_reposted: nextIsReposted, reposts_count: nextCount };
        }
        return p;
      })
    );

    try {
      const res = await api.post(`/posts/${postId}/repost`);
      if (res.data && res.data.data) {
        const { is_reposted, reposts_count } = res.data.data;
        setPosts((prevPosts) =>
          prevPosts.map((p) => (p.id === postId ? { ...p, is_reposted, reposts_count } : p))
        );
        Alert.alert("리포스트", is_reposted ? "게시물을 피드에 리포스트했습니다!" : "리포스트를 취소했습니다.");
      }
    } catch (err) {
      console.log("Error toggling repost", err);
      fetchFeed(true);
    }
  }, []);

  const handleToggleFollowUser = useCallback(async (username: string, currentIsFollowing: boolean) => {
    setPosts((prevPosts) =>
      prevPosts.map((p) => {
        if (p.user?.username === username) {
          return {
            ...p,
            user: { ...p.user, is_following: !currentIsFollowing },
          };
        }
        return p;
      })
    );

    try {
      let response;
      if (currentIsFollowing) {
        response = await api.delete(`/users/${username}/follow`);
        Alert.alert("알림", `@${username} 님을 언팔로우했습니다.`);
      } else {
        response = await api.post(`/users/${username}/follow`);
        Alert.alert("알림", `@${username} 님을 팔로우했습니다.`);
      }
      const confirmedIsFollowing =
        response.data?.data?.is_following ?? !currentIsFollowing;
      setPosts((prevPosts) =>
        prevPosts.map((p) =>
          p.user?.username === username
            ? {
                ...p,
                user: { ...p.user, is_following: confirmedIsFollowing },
              }
            : p
        )
      );
    } catch (err) {
      console.log("Error toggling follow from feed options", err);
      fetchFeed(true);
    }
  }, []);

  const handleOpenDm = useCallback((postItem: FeedPostItem) => {
    setDmPost(postItem);
    setDmModalVisible(true);
  }, []);

  const handleOpenComments = useCallback((postId: string) => {
    setDetailPostId(postId);
    setDetailModalVisible(true);
  }, []);

  const handleMoreOptions = useCallback((item: FeedPostItem) => {
    setOptionsPost(item);
  }, []);

  const handleDetailPress = useCallback((id: string) => {
    setDetailPostId(id);
    setDetailModalVisible(true);
  }, []);

  const handleDeletePost = useCallback(async (postId: string) => {
    try {
      await api.delete(`/posts/${postId}`);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (e) {
      Alert.alert("오류", "삭제에 실패했습니다.");
    }
  }, []);

  const renderPostItem = useCallback(
    ({ item }: { item: FeedPostItem }) => (
      <FeedPostCard
        item={item}
        colors={colors}
        currentUser={user}
        navigation={navigation}
        onToggleLike={handleToggleLike}
        onOpenComments={handleOpenComments}
        onToggleRepost={handleToggleRepost}
        onOpenDm={handleOpenDm}
        onToggleBookmark={handleToggleBookmark}
        onToggleFollowUser={handleToggleFollowUser}
        onMoreOptions={handleMoreOptions}
        onDetailPress={handleDetailPress}
        onDeletePost={handleDeletePost}
      />
    ),
    [
      colors,
      user,
      navigation,
      handleToggleLike,
      handleOpenComments,
      handleToggleRepost,
      handleOpenDm,
      handleToggleBookmark,
      handleToggleFollowUser,
      handleMoreOptions,
      handleDetailPress,
      handleDeletePost,
    ]
  );

  const keyExtractor = useCallback((item: FeedPostItem) => item.id, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      {/* Aura+n Top Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg }]}>
        <AuraLogoText fontSize={26} />
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.noticeIconButton, { backgroundColor: colors.accentPurple + "18", borderColor: colors.accentPurple }]}
            onPress={() => setNoticeModalVisible(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="megaphone-outline" size={18} color={colors.accentPurple} />
            <Text style={[styles.noticeIconText, { color: colors.accentPurple }]}>공지</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.headerIconButton, { backgroundColor: colors.bgInput, position: "relative" }]} onPress={() => setNotificationsModalVisible(true)}>
            <Ionicons name="notifications-outline" size={20} color={colors.textPrimary} />
            {unreadCount > 0 && (
              <View
                style={{
                  position: "absolute",
                  top: -1,
                  right: -2,
                  backgroundColor: colors.accentPink,
                  borderRadius: 4,
                  width: 8,
                  height: 8,
                }}
              />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Section Tabs */}
      <View style={[styles.sectionTabsWrapper, { borderBottomColor: colors.borderLight }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.sectionTabs}
          contentContainerStyle={styles.sectionTabsContent}
        >
          <TouchableOpacity style={styles.sectionTab}>
            <Text style={[styles.sectionTabText, { color: colors.textPrimary }]}>피드</Text>
            <LinearGradient colors={colors.auraGradient} style={styles.sectionIndicator} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.sectionTab} onPress={() => navigation.navigate("Community", { section: "anonymous" })}>
            <Text style={[styles.sectionTabText, { color: colors.textSecondary }]}>익명게시판</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sectionTab} onPress={() => navigation.navigate("Community", { section: "info" })}>
            <Text style={[styles.sectionTabText, { color: colors.textSecondary }]}>정보게시판</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sectionTab} onPress={() => navigation.navigate("Community", { section: "partner" })}>
            <Text style={[styles.sectionTabText, { color: colors.textSecondary }]}>제휴업소</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Subtle Background Refresh Indicator Bar */}
      {backgroundRefreshing && (
        <View style={{ height: 2, backgroundColor: colors.accentPurple || "#a855f7", width: "100%" }} />
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accentBlue} />
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={keyExtractor}
          renderItem={renderPostItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textPrimary} />
          }
          ListHeaderComponent={
            <StoryBar
              storyGroups={storyGroups}
              currentUser={user}
              onPressUserStory={(index) => {
                const targetGroup = storyGroups[index];
                if (targetGroup && targetGroup.is_self) {
                  setMyStoriesGridVisible(true);
                } else {
                  setSelectedStoryGroupIndex(index);
                  setStoryViewerVisible(true);
                }
              }}
              onPressCreateStory={() => {
                setCreateStoryVisible(true);
              }}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: colors.textPrimary }]}>아직 피드 게시물이 없습니다.</Text>
              <Text style={[styles.emptySubText, { color: colors.textSecondary }]}>첫 번째 게시물을 작성해보세요!</Text>
            </View>
          }
        />
      )}

      <PostOptionsSheet
        visible={!!optionsPost}
        post={optionsPost}
        isMine={!!optionsPost && (optionsPost.is_mine || user?.username === optionsPost.user?.username)}
        onClose={() => setOptionsPost(null)}
        onEdit={() => {
          const target = optionsPost;
          setOptionsPost(null);
          if (target) navigation.navigate("CreatePost", { editPost: target });
        }}
        onDelete={() => {
          const target = optionsPost;
          setOptionsPost(null);
          if (target?.id) handleDeletePost(target.id);
        }}
        onReport={() => {
          const target = optionsPost;
          setOptionsPost(null);
          setReportPost(target);
        }}
        onFollow={() => {
          const target = optionsPost;
          setOptionsPost(null);
          if (target?.user?.username) {
            handleToggleFollowUser(target.user.username, target.user.is_following || false);
          }
        }}
        onProfile={() => {
          const targetUser = optionsPost?.user;
          setOptionsPost(null);
          if (targetUser) openUserProfile(navigation, targetUser);
        }}
      />

      <ReportSheet
        visible={!!reportPost}
        targetType="post"
        targetId={reportPost?.id || ""}
        onClose={() => setReportPost(null)}
      />

      <NotificationsModal
        visible={notificationsModalVisible}
        onClose={() => setNotificationsModalVisible(false)}
      />

      {detailPostId && (
        <PostDetailModal
          visible={detailModalVisible}
          postId={detailPostId}
          onClose={() => {
            setDetailModalVisible(false);
            setDetailPostId(null);
          }}
        />
      )}

      {dmPost && (
        <SendPostDmModal
          visible={dmModalVisible}
          post={dmPost}
          onClose={() => {
            setDmModalVisible(false);
            setDmPost(null);
          }}
        />
      )}

      <NoticeListModal
        visible={noticeModalVisible}
        onClose={() => setNoticeModalVisible(false)}
      />

      {/* Story Viewers & Creators */}
      {storyGroups.length > 0 && (
        <StoryViewerModal
          visible={storyViewerVisible}
          storyGroups={storyGroups}
          initialGroupIndex={selectedStoryGroupIndex}
          onClose={() => setStoryViewerVisible(false)}
          onStoryDeleted={() => fetchStories(true)}
        />
      )}

      <CreateStoryModal
        visible={createStoryVisible}
        onClose={() => setCreateStoryVisible(false)}
        onStoryCreated={() => fetchStories(true)}
      />

      <MyStoriesGridModal
        visible={myStoriesGridVisible}
        stories={storyGroups.find((g) => g.is_self)?.stories || []}
        onClose={() => setMyStoriesGridVisible(false)}
        onPressCreateStory={() => {
          setMyStoriesGridVisible(false);
          setCreateStoryVisible(true);
        }}
        onDeleteStory={() => fetchStories(true)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    height: 60,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  noticeIconButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
  },
  noticeIconText: {
    fontSize: 12,
    fontWeight: "700",
  },
  sectionTabsWrapper: {
    borderBottomWidth: 1,
  },
  sectionTabs: {
    height: 48,
  },
  sectionTabsContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  sectionTab: {
    height: 48,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 20,
    position: "relative",
    paddingBottom: 4,
  },
  sectionTabText: {
    fontSize: 15,
    fontWeight: "700",
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  sectionIndicator: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    borderRadius: 1.5,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  postCardGradientBorder: {
    borderRadius: 16,
    padding: 1.5,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  postCardInner: {
    borderRadius: 14.5,
    overflow: "hidden",
  },
  postHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  authorText: {
    flex: 1,
  },
  authorLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  username: {
    fontSize: 14,
    fontWeight: "700",
  },
  headerFollowBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    marginLeft: 4,
  },
  headerFollowBtnText: {
    fontSize: 11,
    fontWeight: "700",
  },
  location: {
    fontSize: 12,
    marginTop: 1,
  },
  postImage: {
    width: "100%",
    height: 360,
  },
  noMedia: {
    justifyContent: "center",
    alignItems: "center",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  actionCountGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  actionCountText: {
    fontSize: 13,
    fontWeight: "600",
  },
  postDetails: {
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  captionBlock: {
    marginBottom: 6,
  },
  timeText: {
    fontSize: 11,
  },
  emptyContainer: {
    paddingVertical: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  emptySubText: {
    fontSize: 13,
  },
});
