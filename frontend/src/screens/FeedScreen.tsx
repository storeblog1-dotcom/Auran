import React, { useEffect, useState } from "react";
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
const DEVICE_ASPECT_RATIO = height / width;

export const FeedScreen = ({ navigation }: any) => {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { unreadCount } = useNotification();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCommentPostId, setActiveCommentPostId] = useState<string | null>(null);
  const [commentsModalVisible, setCommentsModalVisible] = useState<boolean>(false);

  // Modal States
  const [notificationsModalVisible, setNotificationsModalVisible] = useState<boolean>(false);
  const [dmPost, setDmPost] = useState<any | null>(null);
  const [dmModalVisible, setDmModalVisible] = useState<boolean>(false);
  const [detailPostId, setDetailPostId] = useState<string | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState<boolean>(false);
  const [optionsPost, setOptionsPost] = useState<any | null>(null);
  const [reportPost, setReportPost] = useState<any | null>(null);

  // 스토리 관련 상태
  const [storyGroups, setStoryGroups] = useState<any[]>([]);
  const [selectedStoryGroupIndex, setSelectedStoryGroupIndex] = useState<number>(0);
  const [storyViewerVisible, setStoryViewerVisible] = useState<boolean>(false);
  const [createStoryVisible, setCreateStoryVisible] = useState<boolean>(false);
  const [myStoriesGridVisible, setMyStoriesGridVisible] = useState<boolean>(false);

  const selfGroup = storyGroups.find((g) => g.is_self);
  const selfStories = selfGroup ? selfGroup.stories : [];

  const handleDeleteStory = async (storyId: string) => {
    try {
      await api.delete(`/stories/${storyId}`);
      Alert.alert("알림", "스토리가 삭제되었습니다.");
      fetchStories();
    } catch (err) {
      console.log("Error deleting story", err);
      Alert.alert("오류", "스토리 삭제에 실패했습니다.");
    }
  };

  const fetchStories = async () => {
    try {
      const response = await api.get("/stories/feed");
      if (response.data && response.data.data) {
        setStoryGroups(response.data.data);
      }
    } catch (err) {
      console.log("Error fetching stories feed", err);
    }
  };

  const fetchFeed = async () => {
    try {
      const response = await api.get("/posts/feed");
      if (response.data) {
        const feedItems = response.data.data || (Array.isArray(response.data) ? response.data : []);
        setPosts(feedItems);
      }
    } catch (err) {
      console.log("Error fetching feed", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const safetyTimeout = setTimeout(() => {
      setLoading(false);
    }, 800);

    fetchFeed().finally(() => clearTimeout(safetyTimeout));
    fetchStories();
    const unsubscribe = navigation.addListener("focus", () => {
      fetchFeed();
      fetchStories();
    });
    return () => {
      clearTimeout(safetyTimeout);
      unsubscribe();
    };
  }, [navigation]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchFeed();
    fetchStories();
  };

  const handleToggleLike = async (postId: string) => {
    // 낙관적 UI 업데이트
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
      fetchFeed();
    }
  };

  const handleToggleBookmark = async (postId: string) => {
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
      fetchFeed();
    }
  };
  const handleToggleRepost = async (postId: string) => {
    let nextIsReposted = false;
    setPosts((prevPosts) =>
      prevPosts.map((p) => {
        if (p.id === postId) {
          nextIsReposted = !p.is_reposted;
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
      fetchFeed();
    }
  };

  const handleOpenDm = (postItem: any) => {
    setDmPost(postItem);
    setDmModalVisible(true);
  };

  const handleOpenComments = (postId: string) => {
    setDetailPostId(postId);
    setDetailModalVisible(true);
  };

  const handleCommentAdded = async (postId: string) => {
    try {
      const res = await api.get(`/posts/${postId}/comments`);
      if (res.data && res.data.data) {
        const flattenedList: any[] = [];
        res.data.data.forEach((c: any) => {
          flattenedList.push(c);
          if (c.replies && c.replies.length > 0) {
            c.replies.forEach((r: any) => flattenedList.push(r));
          }
        });
        setPosts((prevPosts) =>
          prevPosts.map((p) =>
            p.id === postId
              ? {
                  ...p,
                  comments_count: (p.comments_count || 0) + 1,
                  preview_comments: flattenedList.slice(0, 3),
                }
              : p
          )
        );
      }
    } catch (e) {
      console.log("Error refreshing preview comments on comment add", e);
      setPosts((prevPosts) =>
        prevPosts.map((p) =>
          p.id === postId ? { ...p, comments_count: (p.comments_count || 0) + 1 } : p
        )
      );
    }
  };

  const handleCommentDeleted = async (postId: string) => {
    try {
      const res = await api.get(`/posts/${postId}/comments`);
      if (res.data && res.data.data) {
        const flattenedList: any[] = [];
        res.data.data.forEach((c: any) => {
          flattenedList.push(c);
          if (c.replies && c.replies.length > 0) {
            c.replies.forEach((r: any) => flattenedList.push(r));
          }
        });
        setPosts((prevPosts) =>
          prevPosts.map((p) =>
            p.id === postId
              ? {
                  ...p,
                  comments_count: Math.max(0, (p.comments_count || 0) - 1),
                  preview_comments: flattenedList.slice(0, 3),
                }
              : p
          )
        );
      }
    } catch (e) {
      console.log("Error refreshing preview comments on comment delete", e);
    }
  };

  const { user: currentUser } = useAuth();

  const handleToggleFollowUser = async (username: string, currentIsFollowing: boolean) => {
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
      fetchFeed();
    }
  };

  const handleMoreOptions = (item: any) => {
    setOptionsPost(item);
    return;
    const authorUsername = item.user?.username;
    if (!authorUsername) return;

    const isMe = item.is_mine || (currentUser && currentUser.username === authorUsername);

    if (isMe) {
      Alert.alert(
        "내 게시물",
        "원하시는 작업을 선택하세요.",
        [
          {
            text: "수정하기",
            onPress: () => navigation.navigate("CreatePost", { editPost: item }),
          },
          {
            text: item.visibility === "private" ? "전체 공개로 변경" : "비공개로 변경",
            onPress: async () => {
              try {
                const nextVisibility =
                  item.visibility === "private" ? "public" : "private";
                await api.patch(`/posts/${item.id}`, {
                  visibility: nextVisibility,
                });
                setPosts((prev: any[]) =>
                  prev.map((p) =>
                    p.id === item.id
                      ? { ...p, visibility: nextVisibility }
                      : p
                  )
                );
                Alert.alert(
                  "완료",
                  nextVisibility === "public"
                    ? "게시물이 전체 공개로 변경되었습니다."
                    : "게시물이 비공개로 변경되었습니다."
                );
              } catch (e) {
                Alert.alert("오류", "공개 여부 변경에 실패했습니다.");
              }
            },
          },
          {
            text: "삭제하기",
            style: "destructive",
            onPress: () => {
              Alert.alert("게시물 삭제", "정말 삭제하시겠습니까?", [
                { text: "취소", style: "cancel" },
                {
                  text: "삭제",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      await api.delete(`/posts/${item.id}`);
                      setPosts((prev: any[]) => prev.filter((p) => p.id !== item.id));
                    } catch (e) {
                      Alert.alert("오류", "삭제에 실패했습니다.");
                    }
                  },
                },
              ]);
            },
          },
          { text: "취소", style: "cancel" },
        ],
        { cancelable: true }
      );
      return;
    }

    const isFollowing = item.user?.is_following || false;

    Alert.alert(
      `@${authorUsername}`,
      "원하시는 작업을 선택하세요.",
      [
        {
          text: isFollowing ? "언팔로우 (팔로잉 취소)" : "팔로우 하기",
          style: isFollowing ? "destructive" : "default",
          onPress: () => handleToggleFollowUser(authorUsername, isFollowing),
        },
        {
          text: "프로필 보기",
          onPress: () => openUserProfile(navigation, item.user),
        },
        {
          text: "🚨 게시물 신고하기",
          style: "destructive",
          onPress: async () => {
            try {
              await api.post(`/posts/${item.id}/report`, { reason: "부적절한 내용" });
              Alert.alert("신고 완료", "게시물이 성공적으로 신고 접수되었습니다.");
            } catch (e) {
              console.error(e);
            }
          },
        },
        {
          text: "취소",
          style: "cancel",
        },
      ],
      { cancelable: true }
    );
  };

  const renderPostItem = ({ item }: { item: any }) => {
    const mainMedia = item.media && item.media.length > 0 ? item.media[0].media_url : null;
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
                    onPress={() => handleToggleFollowUser(item.user?.username, isFollowing)}
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
                        onPress: async () => {
                          try {
                            await api.delete(`/posts/${item.id}`);
                            setPosts((prev: any[]) => prev.filter((p) => p.id !== item.id));
                          } catch (e) {
                            Alert.alert("오류", "삭제에 실패했습니다.");
                          }
                        },
                      },
                    ]);
                  }}
                >
                  <Ionicons name="trash-outline" size={20} color="#ef4444" />
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity style={{ padding: 4 }} onPress={() => handleMoreOptions(item)}>
              <Ionicons name="ellipsis-horizontal" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Post Image Media Carousel */}
        {item.media && item.media.length > 0 ? (
          <PostCarousel media={item.media} onPress={() => { setDetailPostId(item.id); setDetailModalVisible(true); }} />
        ) : !item.youtube_url ? (
          <TouchableOpacity
            style={[styles.postImage, styles.noMedia, { backgroundColor: colors.bgCard }]}
            onPress={() => { setDetailPostId(item.id); setDetailModalVisible(true); }}
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
              onPress={() => handleToggleLike(item.id)}
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
              onPress={() => handleOpenComments(item.id)}
            >
              <Ionicons name="chatbubble-outline" size={22} color={colors.textPrimary} />
              <Text style={[styles.actionCountText, { color: colors.textPrimary }]}>{commentsCount}</Text>
            </TouchableOpacity>

            {/* Repost */}
            <TouchableOpacity style={styles.actionCountGroup} onPress={() => handleToggleRepost(item.id)}>
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
            <TouchableOpacity style={styles.actionCountGroup} onPress={() => handleOpenDm(item)}>
              <Ionicons name="paper-plane-outline" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Bookmark Button */}
          <TouchableOpacity onPress={() => handleToggleBookmark(item.id)}>
            <Ionicons
              name={item.is_bookmarked ? "bookmark" : "bookmark-outline"}
              size={23}
              color={colors.textPrimary}
            />
          </TouchableOpacity>
        </View>

        {/* Caption & Details Section */}
        <View style={styles.postDetails}>
          {/* Caption Section (Aligned with photo left edge) */}
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
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      {/* Aura+n Top Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg }]}>
        <AuraLogoText fontSize={26} />
        <View style={styles.headerActions}>
          <TouchableOpacity style={[styles.headerIconButton, { backgroundColor: colors.bgInput }]} onPress={() => navigation.navigate("Search")}>
            <Ionicons name="search-outline" size={21} color={colors.textPrimary} />
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

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.sectionTabs, { borderBottomColor: colors.borderLight }]}
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

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accentBlue} />
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
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
        isMine={!!optionsPost && (optionsPost.is_mine || currentUser?.username === optionsPost.user?.username)}
        onClose={() => setOptionsPost(null)}
        onEdit={() => navigation.navigate("CreatePost", { editPost: optionsPost })}
        onVisibility={async (visibility) => {
          if (!optionsPost) return;
          await api.patch(`/posts/${optionsPost.id}`, { visibility });
          setPosts((prev) => prev.map((item) => item.id === optionsPost.id ? { ...item, visibility } : item));
        }}
        onProfile={() => openUserProfile(navigation, optionsPost?.user)}
        onFollow={() => optionsPost?.user?.username && handleToggleFollowUser(optionsPost.user.username, !!optionsPost.user.is_following)}
        onHide={async () => {
          if (!optionsPost) return;
          await api.post("/hidden-content", { target_type: "post", target_id: optionsPost.id });
          setPosts((prev) => prev.filter((item) => item.id !== optionsPost.id));
        }}
        onBlock={async () => {
          if (!optionsPost?.user?.username) return;
          await api.post(`/users/${optionsPost.user.username}/block`);
          setPosts((prev) => prev.filter((item) => item.user?.username !== optionsPost.user.username));
        }}
        onReport={() => setReportPost(optionsPost)}
        onDelete={async () => {
          if (!optionsPost) return;
          await api.delete(`/posts/${optionsPost.id}`);
          setPosts((prev) => prev.filter((item) => item.id !== optionsPost.id));
        }}
      />
      <ReportSheet
        visible={!!reportPost}
        targetType="post"
        targetId={reportPost?.id || null}
        targetUsername={reportPost?.user?.username}
        onClose={() => setReportPost(null)}
        onHidden={() => {
          if (reportPost) setPosts((prev) => prev.filter((item) => item.id !== reportPost.id));
        }}
      />

      {/* Comments Modal */}
      <CommentsModal
        visible={commentsModalVisible}
        postId={activeCommentPostId}
        onClose={() => setCommentsModalVisible(false)}
        onCommentAdded={() => {
          if (activeCommentPostId) handleCommentAdded(activeCommentPostId);
        }}
        onCommentDeleted={() => {
          if (activeCommentPostId) handleCommentDeleted(activeCommentPostId);
        }}
      />

      {/* Post Detail Modal */}
      <PostDetailModal
        visible={detailModalVisible}
        postId={detailPostId}
        onClose={() => setDetailModalVisible(false)}
        onPostUpdated={fetchFeed}
      />

      {/* Story Viewer Modal — 타 유저 스토리만 (내 스토리 제외) */}
      {(() => {
        const otherGroups = storyGroups.filter((g) => !g.is_self);
        // selectedStoryGroupIndex는 storyGroups 기준이므로 otherGroups 기준으로 재계산
        const selectedGroup = storyGroups[selectedStoryGroupIndex];
        const adjustedIndex = selectedGroup
          ? otherGroups.findIndex((g) => g.user?.id === selectedGroup.user?.id)
          : 0;
        return (
          <StoryViewerModal
            visible={storyViewerVisible}
            storyGroups={otherGroups}
            initialGroupIndex={Math.max(0, adjustedIndex)}
            onClose={() => setStoryViewerVisible(false)}
            onStoryViewed={(storyId) => {
              setStoryGroups((prev) =>
                prev.map((group) => {
                  const updatedStories = group.stories.map((s: any) =>
                    s.id === storyId ? { ...s, has_viewed: true } : s
                  );
                  const hasUnviewed = updatedStories.some((s: any) => !s.has_viewed);
                  return { ...group, stories: updatedStories, has_unviewed: hasUnviewed };
                })
              );
            }}
            onStoryDeleted={() => {
              fetchStories();
            }}
          />
        );
      })()}

      {/* Create Story Modal */}
      <CreateStoryModal
        visible={createStoryVisible}
        onClose={() => setCreateStoryVisible(false)}
        onStoryCreated={() => {
          fetchStories();
        }}
      />

      {/* My Stories Grid Modal */}
      <MyStoriesGridModal
        visible={myStoriesGridVisible}
        stories={selfStories}
        onClose={() => setMyStoriesGridVisible(false)}
        onPressCreateStory={() => setCreateStoryVisible(true)}
        onDeleteStory={handleDeleteStory}
      />

      {/* Notifications Modal */}
      <NotificationsModal
        visible={notificationsModalVisible}
        onClose={() => setNotificationsModalVisible(false)}
        onNavigateProfile={(username) => {
          navigation.navigate("UserProfile", { username });
        }}
      />

      {/* Send Post by DM Modal */}
      <SendPostDmModal
        visible={dmModalVisible}
        post={dmPost}
        onClose={() => {
          setDmModalVisible(false);
          setDmPost(null);
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  header: {
    height: 60,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
  },
  sectionTabs: {
    maxHeight: 48,
    borderBottomWidth: 1,
  },
  sectionTabsContent: {
    minHeight: 48,
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 6,
  },
  sectionTab: {
    minWidth: 88,
    height: 48,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  sectionTabText: { fontSize: 14, fontWeight: "800" },
  sectionIndicator: {
    position: "absolute",
    bottom: 0,
    width: 32,
    height: 3,
    borderRadius: 3,
  },
  headerBadgeTouchable: {
    padding: 2,
  },
  headerBadgeGradient: {
    width: 36,
    height: 36,
    borderRadius: 18,
    padding: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  headerBadgeInner: {
    width: "100%",
    height: "100%",
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  headerBadgeText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 1.2,
    color: "#fff",
  },
  createBtn: {
    color: "#0095f6",
    fontSize: 15,
    fontWeight: "bold",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  postCardGradientBorder: {
    borderRadius: 24,
    padding: 1.5,
    marginHorizontal: 12,
    marginVertical: 10,
    shadowColor: "#7652df",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 8,
  },
  postCardInner: {
    borderRadius: 22.5,
    padding: 14,
    overflow: "hidden",
  },
  postHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 0,
    paddingVertical: 8,
  },
  userInfo: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    marginRight: 8,
  },
  authorText: {
    flex: 1,
    minWidth: 0,
  },
  authorLine: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginRight: 10,
  },
  username: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
    flexShrink: 1,
  },
  headerFollowBtn: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    marginLeft: 8,
  },
  headerFollowBtnText: {
    fontSize: 12,
    fontWeight: "bold",
  },
  location: {
    color: "#8e8e8e",
    fontSize: 12,
    minWidth: 0,
    flexShrink: 1,
    flexWrap: "wrap",
  },
  postImage: {
    width: width - 52,
    height: (width - 52) * 1.28,
    borderRadius: 18,
    alignSelf: "center",
    marginVertical: 10,
    backgroundColor: "#161622",
  },
  noMedia: {
    justifyContent: "center",
    alignItems: "center",
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 0,
    paddingVertical: 8,
  },
  actionCountGroup: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 6,
  },
  actionIcon: {
    fontSize: 20,
  },
  actionCountText: {
    fontSize: 14,
    fontWeight: "bold",
    marginLeft: 4,
  },
  postDetails: {
    paddingHorizontal: 0,
    minWidth: 0,
  },
  captionBlock: {
    paddingVertical: 6,
    paddingHorizontal: 0,
    minWidth: 0,
  },
  commentsBlock: {
    paddingTop: 6,
    marginTop: 4,
  },
  likesText: {
    color: "#fff",
    fontWeight: "bold",
    marginBottom: 4,
  },
  captionText: {
    color: "#fff",
    fontSize: 14,
    lineHeight: 18,
  },
  captionUsername: {
    fontWeight: "bold",
  },
  commentPreviewText: {
    color: "#fff",
    fontSize: 14,
    lineHeight: 18,
    marginTop: 2,
  },
  commentsCountText: {
    color: "#8e8e8e",
    fontSize: 13,
  },
  commentIconBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
  },
  commentIconBtnText: {
    fontSize: 12.5,
    fontWeight: "600",
  },
  timeText: {
    color: "#8e8e8e",
    fontSize: 11,
    marginTop: 4,
  },
  emptyContainer: {
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 60,
  },
  emptyText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 8,
    textAlign: "center",
    paddingHorizontal: 16,
    width: "100%",
    lineHeight: 24,
  },
  emptySubText: {
    color: "#8e8e8e",
    fontSize: 14,
    marginBottom: 20,
    textAlign: "center",
    paddingHorizontal: 16,
    width: "100%",
    lineHeight: 20,
  },
  emptyBtn: {
    backgroundColor: "#0095f6",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 6,
  },
  emptyBtnText: {
    color: "#fff",
    fontWeight: "bold",
  },
});
