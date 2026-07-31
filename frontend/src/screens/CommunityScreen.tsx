import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  Image,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
  Alert,
  ScrollView,
  InteractionManager,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useContextualCompose } from "../context/ContextualComposeContext";
import { useIsFocused } from "@react-navigation/native";
import { getDisplayName } from "../utils/displayName";
import api from "../services/api";
import axios from "axios";
import { getFullImageUrl } from "../config";
import { CreateCommunityPostModal } from "../components/CreateCommunityPostModal";
import { CommunityPostDetailModal } from "../components/CommunityPostDetailModal";
import { ImageDetailViewerModal } from "../components/ImageDetailViewerModal";
import { AuraLogoText } from "../components/AuraLogoText";
import { AdminAvatar, AdminBadge } from "../components/AdminIdentity";
import { VerifiedYouTubeCard } from "../components/VerifiedYouTubeCard";
import { HashtagText } from "../components/HashtagText";
import { NoticeListModal } from "../components/NoticeListModal";

const { width } = Dimensions.get("window");
type CommunitySection = "anonymous" | "info" | "partner";
const ALL_CHILD_BOARDS_ID = "__all_child_boards__";
const PARTNER_BOARD_NAME = "\uC81C\uD734\uC5C5\uC18C";
const ANONYMOUS_CATEGORY_ORDER = [
  { slug: "anonymous-worries", name: "고민상담" },
  { slug: "anonymous-relationship", name: "연애·관계" },
  { slug: "anonymous-daily", name: "일상" },
  { slug: "anonymous-coming-out", name: "커밍아웃" },
];

const FRESH_TTL = 30_000;       // 30 seconds: Fresh cache (no background fetch needed)
const STALE_TTL = 300_000;      // 5 minutes: Stale cache (show cache + background refresh)

import {
  communityService,
  CommunityBoard,
  CommunityNotice,
  CommunityPost,
} from "../services/communityService";

export type { CommunityBoard, CommunityNotice, CommunityPost };

export interface BoardCacheEntry {
  data: CommunityPost[];
  notices: CommunityNotice[];
  timestamp: number;
  hasMore: boolean;
  page: number;
}

const isPartnerBoardRecord = (board: any) =>
  String(board?.slug || "").toLowerCase().includes("partner")
  || String(board?.name || "").includes(PARTNER_BOARD_NAME);

// ─── Typed In-Memory Cache Store ──────────────
let cachedBoardsList: CommunityBoard[] | null = null;
const cachedPostsMap: Record<string, BoardCacheEntry> = {};

export const clearCommunityCache = () => {
  cachedBoardsList = null;
  Object.keys(cachedPostsMap).forEach((key) => delete cachedPostsMap[key]);
};

// ─── Memoized Post Card Component ──────────────
const CommunityPostCard = React.memo(
  ({
    item,
    colors,
    currentUser,
    selectedBoardId,
    onPress,
    onEdit,
    onDelete,
    onMediaPress,
    onToggleLike,
  }: {
    item: CommunityPost;
    colors: any;
    currentUser: any;
    selectedBoardId: string | null;
    onPress: (id: string) => void;
    onEdit: (item: CommunityPost) => void;
    onDelete: (id: string) => void;
    onMediaPress: (media: any[]) => void;
    onToggleLike: (id: string) => void;
  }) => {
    const isAnonymous = item.board_type === "anonymous";
    const hideIdentity = isAnonymous && !item.user?.is_admin;
    const mediaUrl = item.media && item.media.length > 0 ? item.media[0].media_url : null;
    const isMe = item.is_mine || (currentUser && item.user?.username === currentUser.username);

    return (
      <TouchableOpacity
        style={[
          styles.postCard,
          {
            backgroundColor: colors.bgCard || "#18181b",
            borderColor: colors.borderColor || "#27272a",
          },
        ]}
        onPress={() => onPress(item.id)}
        activeOpacity={0.8}
      >
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={styles.authorGroup}>
            {hideIdentity ? (
              <View style={[styles.anonAvatarBadge, { backgroundColor: "rgba(139, 92, 246, 0.15)" }]}>
                <Ionicons name="eye-off" size={14} color={colors.accentPurple || "#a855f7"} />
              </View>
            ) : (
              <AdminAvatar user={item.user} style={styles.userAvatar} />
            )}
            <Text style={[styles.authorText, { color: colors.textPrimary }]}>
              {hideIdentity ? "익명" : getDisplayName(item.user)}
            </Text>
            {item.user?.is_admin && <AdminBadge />}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {isMe && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    onEdit(item);
                  }}
                  style={{ padding: 2 }}
                >
                  <Ionicons name="create-outline" size={18} color={colors.accentPurple || "#a855f7"} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    Alert.alert("게시글 삭제", "정말 삭제하시겠습니까?", [
                      { text: "취소", style: "cancel" },
                      {
                        text: "삭제",
                        style: "destructive",
                        onPress: () => onDelete(item.id),
                      },
                    ]);
                  }}
                  style={{ padding: 2 }}
                >
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                </TouchableOpacity>
              </View>
            )}
            <Text style={[styles.dateText, { color: colors.textSecondary }]}>
              {new Date(item.created_at).toLocaleDateString("ko-KR", {
                month: "short",
                day: "numeric",
              })}
            </Text>
          </View>
        </View>

        {/* Content Section */}
        <View style={styles.cardBodyRow}>
          <View style={{ flex: 1, paddingRight: mediaUrl ? 12 : 0 }}>
            {selectedBoardId === ALL_CHILD_BOARDS_ID && item.board_name ? (
              <Text style={[styles.boardLabel, { color: colors.accentPurple }]}>{item.board_name}</Text>
            ) : null}
            {item.title ? (
              <Text style={[styles.postTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                {item.title}
              </Text>
            ) : null}
            <Text
              style={[
                styles.postCaption,
                { color: item.title ? colors.textSecondary : colors.textPrimary },
              ]}
              numberOfLines={2}
            >
              {item.caption}
            </Text>
            <VerifiedYouTubeCard
              url={item.youtube_url}
              title={item.youtube_title}
              thumbnailUrl={item.youtube_thumbnail_url}
              compact
            />
          </View>
          {mediaUrl ? (
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                onMediaPress(item.media && item.media.length > 0 ? item.media : [{ media_url: mediaUrl }]);
              }}
              activeOpacity={0.85}
            >
              <Image source={{ uri: getFullImageUrl(mediaUrl) }} style={styles.thumbnailImage} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Footer */}
        <View style={[styles.cardFooter, { borderTopColor: colors.borderColor || "#27272a" }]}>
          <TouchableOpacity
            style={styles.footerAction}
            onPress={(e) => {
              e.stopPropagation();
              onToggleLike(item.id);
            }}
          >
            <Ionicons
              name={item.is_liked ? "heart" : "heart-outline"}
              size={18}
              color={item.is_liked ? "#ec4899" : colors.textSecondary}
            />
            <Text
              style={[
                styles.footerActionText,
                { color: item.is_liked ? "#ec4899" : colors.textSecondary },
              ]}
            >
              {item.likes_count || 0}
            </Text>
          </TouchableOpacity>

          <View style={styles.footerAction}>
            <Ionicons name="chatbubble-outline" size={16} color={colors.textSecondary} />
            <Text style={[styles.footerActionText, { color: colors.textSecondary }]}>
              {item.comments_count || 0}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }
);

// ─── Main Screen Component ──────────────
export const CommunityScreen = ({ navigation, route }: any) => {
  const { colors } = useTheme();
  const { setCommunityComposeDisabled } = useContextualCompose();
  const subBoardScrollRef = useRef<ScrollView>(null);
  const postFlatListRef = useRef<FlatList>(null);

  const isMountedRef = useRef<boolean>(true);
  const activeRequestKeyRef = useRef<string | null>(null);
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const inFlightPrefetchMapRef = useRef<Record<string, boolean>>({});
  const interactionTaskRef = useRef<any>(null);

  const isFocused = useIsFocused();
  const { user: currentUser } = useAuth();
  const requestedSection: CommunitySection = route?.params?.section === "partner"
    ? "partner"
    : route?.params?.section === "info"
      ? "info"
      : "anonymous";

  const [section, setSection] = useState<CommunitySection>(requestedSection);
  const [boards, setBoards] = useState<CommunityBoard[]>(cachedBoardsList || []);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [notices, setNotices] = useState<CommunityNotice[]>([]);
  const [expandedNoticeIds, setExpandedNoticeIds] = useState<string[]>([]);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState<boolean>(!cachedBoardsList);
  const [backgroundRefreshing, setBackgroundRefreshing] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<boolean>(false);

  // Modals
  const [createModalVisible, setCreateModalVisible] = useState<boolean>(false);
  const [editingPost, setEditingPost] = useState<any | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState<boolean>(false);
  const [noticeModalVisible, setNoticeModalVisible] = useState<boolean>(false);

  // Image Viewer State
  const [viewerVisible, setViewerVisible] = useState<boolean>(false);
  const [viewerMedia, setViewerMedia] = useState<any[]>([]);
  const [viewerIndex, setViewerIndex] = useState<number>(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (activeAbortControllerRef.current) {
        activeAbortControllerRef.current.abort();
      }
      if (interactionTaskRef.current && interactionTaskRef.current.cancel) {
        interactionTaskRef.current.cancel();
      }
    };
  }, []);

  const selectedBoard = boards.find((board) => board.id === selectedBoardId)
    || (selectedBoardId === ALL_CHILD_BOARDS_ID ? boards.find((board) => board.id === selectedParentId) : undefined);
  const selectedParentBoard = boards.find((board) => board.id === selectedParentId)
    || (selectedBoard && !selectedBoard.parent_id ? selectedBoard : undefined);
  const isPartnerBoard = Boolean(
    selectedBoard &&
      (String(selectedBoard.slug || "").toLowerCase().includes("partner") ||
        String(selectedBoard.name || "").includes("제휴업소"))
  );
  const selectedIsPartnerBoard = Boolean(selectedBoard && isPartnerBoardRecord(selectedBoard));
  const canComposeInSelectedBoard = !selectedIsPartnerBoard || Boolean(currentUser?.is_admin);

  const sectionBoards = boards.filter((board) => {
    const isAnonymous = Boolean(board.is_anonymous || String(board.slug || "").toLowerCase().includes("anonymous"));
    const isPartner = isPartnerBoardRecord(board);
    if (section === "anonymous") return isAnonymous;
    if (section === "partner") return !isAnonymous && isPartner;
    return !isAnonymous && !isPartner;
  });

  const parentBoards = sectionBoards.filter((board) => !board.parent_id);
  const childBoards = sectionBoards.filter((board) => board.parent_id === selectedParentId);
  const orderedChildBoards = [...childBoards]
    .sort((a, b) => {
      if (Boolean(a.is_default) !== Boolean(b.is_default)) return a.is_default ? 1 : -1;
      if (section === "anonymous") {
        const aIndex = ANONYMOUS_CATEGORY_ORDER.findIndex((category) => category.slug === a.slug);
        const bIndex = ANONYMOUS_CATEGORY_ORDER.findIndex((category) => category.slug === b.slug);
        if (aIndex >= 0 || bIndex >= 0) {
          if (aIndex < 0) return 1;
          if (bIndex < 0) return -1;
          if (aIndex !== bIndex) return aIndex - bIndex;
        }
      }
      const sortDifference = Number(a.sort_order || 0) - Number(b.sort_order || 0);
      if (sortDifference !== 0) return sortDifference;
      return String(a.name || "").localeCompare(String(b.name || ""), "ko");
    })
    .map((board) => {
      const category = ANONYMOUS_CATEGORY_ORDER.find((item) => item.slug === board.slug);
      return section === "anonymous" && category ? { ...board, name: category.name } : board;
    });

  const visibleChildBoards = selectedParentId
    ? [{ id: ALL_CHILD_BOARDS_ID, name: "전체", is_anonymous: selectedBoard?.is_anonymous }, ...orderedChildBoards]
    : childBoards;
  const defaultChildBoard = childBoards.find((board) => board.is_default) || childBoards[0];

  const selectFirstBoard = (list: CommunityBoard[], nextSection: CommunitySection) => {
    const candidates = list.filter((board) => {
      const isAnonymous = Boolean(board.is_anonymous || String(board.slug || "").toLowerCase().includes("anonymous"));
      const isPartner = isPartnerBoardRecord(board);
      if (nextSection === "anonymous") return isAnonymous;
      if (nextSection === "partner") return !isAnonymous && isPartner;
      return !isAnonymous && !isPartner;
    });
    const first = candidates.find((board) => !board.parent_id) || candidates[0];
    const firstChild = candidates.find((board) => board.parent_id === first?.id);
    setSelectedParentId(first?.id || null);
    setSelectedBoardId(firstChild ? ALL_CHILD_BOARDS_ID : (first?.id || null));
  };

  const fetchBoards = async () => {
    try {
      const list = await communityService.getBoards();
      cachedBoardsList = list;
      if (isMountedRef.current) setBoards(list);
    } catch (err) {
      console.log("Error fetching community boards", err);
      if (!cachedBoardsList && isMountedRef.current) setBoards([]);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  // ─── Separate Prefetch Function ──────────────
  const prefetchBoard = async (targetBoardId: string) => {
    if (!targetBoardId) return;
    const userIdStr = currentUser?.id || "guest";
    const cacheKey = `${userIdStr}_${selectedParentId}_${targetBoardId}`;

    const existing = cachedPostsMap[cacheKey];
    if (existing && Date.now() - existing.timestamp < FRESH_TTL) return;
    if (inFlightPrefetchMapRef.current[cacheKey]) return;

    inFlightPrefetchMapRef.current[cacheKey] = true;
    try {
      const isAllChildren = targetBoardId === ALL_CHILD_BOARDS_ID;
      const [postsResult, noticeList] = await Promise.all([
        communityService.getPosts(targetBoardId, selectedParentId, isAllChildren),
        communityService.getGlobalNotices(),
      ]);

      if (postsResult.data) {
        cachedPostsMap[cacheKey] = {
          data: postsResult.data,
          notices: noticeList,
          timestamp: Date.now(),
          hasMore: postsResult.meta.has_more || false,
          page: 1,
        };
      }
    } catch (e) {
      // Silently catch prefetch failures
    } finally {
      delete inFlightPrefetchMapRef.current[cacheKey];
    }
  };

  const triggerAdjacentPrefetch = useCallback((currentBoardId: string) => {
    const runPrefetch = () => {
      if (!visibleChildBoards || visibleChildBoards.length <= 1) return;
      const currentIndex = visibleChildBoards.findIndex((b) => b.id === currentBoardId);
      if (currentIndex < 0) return;

      const targets: string[] = [];
      if (currentIndex > 0) targets.push(visibleChildBoards[currentIndex - 1].id);
      if (currentIndex < visibleChildBoards.length - 1) targets.push(visibleChildBoards[currentIndex + 1].id);

      targets.forEach((bId) => prefetchBoard(bId));
    };

    if (InteractionManager && InteractionManager.runAfterInteractions) {
      interactionTaskRef.current = InteractionManager.runAfterInteractions(runPrefetch);
    } else {
      interactionTaskRef.current = setTimeout(runPrefetch, 200);
    }
  }, [visibleChildBoards, selectedParentId, currentUser?.id]);

  // ─── Active Fetch Function ──────────────
  const fetchCommunityPosts = async (boardId: string | null, forceRefresh: boolean = false) => {
    if (!boardId) {
      if (isMountedRef.current) {
        setPosts([]);
        setNotices([]);
        setLoading(false);
        setRefreshing(false);
        setBackgroundRefreshing(false);
      }
      return;
    }

    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    activeAbortControllerRef.current = controller;

    const userIdStr = currentUser?.id || "guest";
    const cacheKey = `${userIdStr}_${selectedParentId}_${boardId}`;
    activeRequestKeyRef.current = cacheKey;

    const now = Date.now();
    const cachedEntry = cachedPostsMap[cacheKey];

    if (!forceRefresh && cachedEntry && cachedEntry.data) {
      const age = now - cachedEntry.timestamp;
      if (isMountedRef.current) {
        setPosts(cachedEntry.data);
        setNotices(cachedEntry.notices || []);
        setLoading(false);
        setFetchError(false);
      }

      if (age < FRESH_TTL) {
        triggerAdjacentPrefetch(boardId);
        return;
      }
      if (isMountedRef.current) setBackgroundRefreshing(true);
    } else {
      if (isMountedRef.current) {
        setPosts([]);
        setNotices([]);
        setLoading(true);
        setFetchError(false);
      }
    }

    try {
      const isAllChildren = boardId === ALL_CHILD_BOARDS_ID;
      const [postsResult, noticeList] = await Promise.all([
        communityService.getPosts(boardId, selectedParentId, isAllChildren, controller.signal),
        communityService.getGlobalNotices(controller.signal),
      ]);

      if (activeRequestKeyRef.current !== cacheKey) return;

      if (postsResult.data) {
        cachedPostsMap[cacheKey] = {
          data: postsResult.data,
          notices: noticeList,
          timestamp: Date.now(),
          hasMore: postsResult.meta.has_more || false,
          page: 1,
        };

        if (isMountedRef.current) {
          setPosts(postsResult.data);
          setNotices(noticeList);
          setFetchError(false);
        }
      }
    } catch (err: any) {
      if (err?.name === "CanceledError" || err?.name === "AbortError" || axios.isCancel(err)) {
        return;
      }
      console.log("Error fetching community posts", err);
      if (isMountedRef.current && (!cachedPostsMap[cacheKey] || cachedPostsMap[cacheKey].data.length === 0)) {
        setFetchError(true);
      }
    } finally {
      if (isMountedRef.current && activeRequestKeyRef.current === cacheKey) {
        setLoading(false);
        setRefreshing(false);
        setBackgroundRefreshing(false);
        triggerAdjacentPrefetch(boardId);
      }
    }
  };

  useEffect(() => {
    if (!cachedBoardsList) {
      setLoading(true);
      fetchBoards();
    } else {
      setLoading(false);
    }
  }, []);

  useLayoutEffect(() => {
    setSection(requestedSection);
  }, [requestedSection]);

  useEffect(() => {
    setCommunityComposeDisabled(isFocused && !canComposeInSelectedBoard);
  }, [isFocused, canComposeInSelectedBoard, setCommunityComposeDisabled]);

  useEffect(() => {
    if (!route?.params?.composeNonce) return;
    navigation.setParams({ composeNonce: undefined });
    if (!canComposeInSelectedBoard) {
      Alert.alert("글쓰기 제한", "제휴업소 게시판은 관리자만 글을 작성할 수 있습니다.");
      return;
    }
    setEditingPost(null);
    setCreateModalVisible(true);
  }, [route?.params?.composeNonce, navigation, canComposeInSelectedBoard]);

  const changeSection = (nextSection: CommunitySection) => {
    setSection(nextSection);
    navigation.setParams({ section: nextSection });
  };

  useLayoutEffect(() => {
    if (boards.length) selectFirstBoard(boards, section);
  }, [boards, section]);

  useEffect(() => {
    subBoardScrollRef.current?.scrollTo({ x: 0, y: 0, animated: false });
    postFlatListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [section, selectedParentId]);

  useEffect(() => {
    if (selectedBoardId) {
      fetchCommunityPosts(selectedBoardId);
    }
  }, [selectedBoardId, selectedParentId]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchBoards();
    fetchCommunityPosts(selectedBoardId, true);
  };

  const toggleNotice = (noticeId: string) => {
    setExpandedNoticeIds((current) =>
      current.includes(noticeId)
        ? current.filter((id) => id !== noticeId)
        : [...current, noticeId]
    );
  };

  const handleToggleLike = useCallback(async (postId: string) => {
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id === postId) {
          const nextIsLiked = !p.is_liked;
          const nextCount = nextIsLiked
            ? (p.likes_count || 0) + 1
            : Math.max(0, (p.likes_count || 0) - 1);
          return { ...p, is_liked: nextIsLiked, likes_count: nextCount };
        }
        return p;
      })
    );

    // Update all entries in cachedPostsMap that contain this post (e.g. child board + ALL_CHILD_BOARDS_ID)
    Object.keys(cachedPostsMap).forEach((key) => {
      if (cachedPostsMap[key]?.data) {
        cachedPostsMap[key].data = cachedPostsMap[key].data.map((p) => {
          if (p.id === postId) {
            const nextIsLiked = !p.is_liked;
            const nextCount = nextIsLiked
              ? (p.likes_count || 0) + 1
              : Math.max(0, (p.likes_count || 0) - 1);
            return { ...p, is_liked: nextIsLiked, likes_count: nextCount };
          }
          return p;
        });
      }
    });

    try {
      const res = await api.post(`/posts/${postId}/like`);
      if (res.data && res.data.data) {
        const updated = res.data.data;
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId
              ? { ...p, is_liked: updated.is_liked, likes_count: updated.likes_count }
              : p
          )
        );
        Object.keys(cachedPostsMap).forEach((key) => {
          if (cachedPostsMap[key]?.data) {
            cachedPostsMap[key].data = cachedPostsMap[key].data.map((p) =>
              p.id === postId
                ? { ...p, is_liked: updated.is_liked, likes_count: updated.likes_count }
                : p
            );
          }
        });
      }
    } catch (e) {
      console.log("Error toggling like", e);
    }
  }, []);

  const handlePostPress = useCallback((id: string) => {
    setSelectedPostId(id);
    setDetailModalVisible(true);
  }, []);

  const handlePostEdit = useCallback((item: CommunityPost) => {
    setEditingPost(item);
    setCreateModalVisible(true);
  }, []);

  const handlePostDelete = useCallback((postId: string) => {
    api.delete(`/posts/${postId}`)
      .then(() => {
        setPosts((prev) => prev.filter((p) => p.id !== postId));
        Object.keys(cachedPostsMap).forEach((key) => {
          if (cachedPostsMap[key]?.data) {
            cachedPostsMap[key].data = cachedPostsMap[key].data.filter((p) => p.id !== postId);
          }
        });
      })
      .catch(() => {
        Alert.alert("오류", "삭제에 실패했습니다.");
      });
  }, [currentUser?.id, selectedParentId, selectedBoardId]);

  const handleMediaPress = useCallback((media: any[]) => {
    setViewerMedia(media);
    setViewerIndex(0);
    setViewerVisible(true);
  }, []);

  const renderPostItem = useCallback(
    ({ item }: { item: CommunityPost }) => (
      <CommunityPostCard
        item={item}
        colors={colors}
        currentUser={currentUser}
        selectedBoardId={selectedBoardId}
        onPress={handlePostPress}
        onEdit={handlePostEdit}
        onDelete={handlePostDelete}
        onMediaPress={handleMediaPress}
        onToggleLike={handleToggleLike}
      />
    ),
    [colors, currentUser, selectedBoardId, handlePostPress, handlePostEdit, handlePostDelete, handleMediaPress, handleToggleLike]
  );

  const keyExtractor = useCallback((item: CommunityPost) => item.id, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary || "#09090b" }]}>
      {/* Top Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg }]}>
        <AuraLogoText fontSize={26} />
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>커뮤니티</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.noticeIconButton, { backgroundColor: colors.accentPurple + "18", borderColor: colors.accentPurple }]}
            onPress={() => setNoticeModalVisible(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="megaphone-outline" size={18} color={colors.accentPurple} />
            <Text style={[styles.noticeIconText, { color: colors.accentPurple }]}>공지</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.headerIconButton, { backgroundColor: colors.bgInput }]} onPress={() => navigation.navigate("Notification")}>
            <Ionicons name="notifications-outline" size={20} color={colors.textPrimary} />
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
          <TouchableOpacity style={styles.sectionTab} onPress={() => navigation.navigate("FeedHome")}>
            <Text style={[styles.sectionTabText, { color: colors.textSecondary }]}>피드</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sectionTab} onPress={() => changeSection("anonymous")}>
            <Text style={[styles.sectionTabText, { color: section === "anonymous" ? colors.textPrimary : colors.textSecondary }]}>익명게시판</Text>
            {section === "anonymous" && <LinearGradient colors={colors.auraGradient} style={styles.sectionIndicator} />}
          </TouchableOpacity>
          <TouchableOpacity style={styles.sectionTab} onPress={() => changeSection("info")}>
            <Text style={[styles.sectionTabText, { color: section === "info" ? colors.textPrimary : colors.textSecondary }]}>정보게시판</Text>
            {section === "info" && <LinearGradient colors={colors.auraGradient} style={styles.sectionIndicator} />}
          </TouchableOpacity>
          <TouchableOpacity style={styles.sectionTab} onPress={() => changeSection("partner")}>
            <Text style={[styles.sectionTabText, { color: section === "partner" ? colors.textPrimary : colors.textSecondary }]}>제휴업소</Text>
            {section === "partner" && <LinearGradient colors={colors.auraGradient} style={styles.sectionIndicator} />}
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Sub-Board Chips (Selects state IMMEDIATELY on click) */}
      {visibleChildBoards.length > 0 && (
        <View style={[styles.boardArea, { borderBottomColor: colors.borderLight }]}>
          <ScrollView ref={subBoardScrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subBoardScroll}>
            {visibleChildBoards.map((board) => (
              <TouchableOpacity
                key={board.id}
                style={[
                  styles.subBoardChip,
                  {
                    backgroundColor: selectedBoardId === board.id ? colors.accentPurple + "12" : "transparent",
                    borderColor: selectedBoardId === board.id ? colors.accentPurple : colors.borderColor,
                  },
                ]}
                onPress={() => setSelectedBoardId(board.id)} // IMMEDIATE SELECTION CHANGE
                activeOpacity={0.7}
              >
                <Text style={{ color: selectedBoardId === board.id ? colors.accentBlue : colors.textSecondary, fontWeight: "700" }}>
                  {board.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Subtle Background Refresh Indicator Bar */}
      {backgroundRefreshing && (
        <View style={{ height: 2, backgroundColor: colors.accentPurple || "#a855f7", width: "100%" }} />
      )}

      {/* Post List & Loading UI */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.accentPurple || "#a855f7"} />
        </View>
      ) : fetchError && posts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="alert-circle-outline" size={48} color="#ef4444" style={{ marginBottom: 12 }} />
          <Text style={[styles.emptyText, { color: colors.textPrimary }]}>목록을 불러오지 못했습니다.</Text>
          <TouchableOpacity
            style={{ marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.accentPurple, borderRadius: 8 }}
            onPress={() => fetchCommunityPosts(selectedBoardId, true)}
          >
            <Text style={{ color: "#ffffff", fontWeight: "700" }}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          ref={postFlatListRef}
          data={posts}
          keyExtractor={keyExtractor}
          renderItem={renderPostItem}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <>
              {notices.length ? (
                <View style={styles.noticeList}>
                  {notices.map((notice) => {
                    const isExpanded = expandedNoticeIds.includes(notice.id);
                    return (
                      <TouchableOpacity
                        key={notice.id}
                        style={[styles.noticeCard, { backgroundColor: colors.bgCard, borderColor: colors.accentPurple }]}
                        onPress={() => toggleNotice(notice.id)}
                        activeOpacity={0.8}
                      >
                        <View style={styles.noticeHeaderRow}>
                          <Ionicons name="megaphone-outline" size={16} color={colors.accentPurple} style={{ marginRight: 8 }} />
                          <Text style={[styles.noticeTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                            {notice.title}
                          </Text>
                          <Ionicons name={isExpanded ? "chevron-up-outline" : "chevron-down-outline"} size={18} color={colors.textSecondary} style={{ marginLeft: 8 }} />
                        </View>
                        {isExpanded ? (
                          <View style={[styles.noticeExpandedBody, { borderTopColor: colors.borderLight }]}>
                            <HashtagText text={notice.content} style={styles.noticeContent} />
                          </View>
                        ) : (
                          <Text style={[styles.noticeContentSnippet, { color: colors.textSecondary }]} numberOfLines={1}>
                            {notice.content.replace(/<[^>]+>/g, "")}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}
            </>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accentPurple || "#a855f7"}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons
                name={selectedBoard?.is_anonymous ? "eye-off-outline" : "information-circle-outline"}
                size={48}
                color={colors.textSecondary}
                style={{ marginBottom: 12 }}
              />
              <Text style={[styles.emptyText, { color: colors.textPrimary }]}>
                등록된 게시글이 없습니다.
              </Text>
              <Text
                numberOfLines={0}
                style={[styles.emptySubText, { color: colors.textSecondary }]}
              >
                {selectedBoard?.is_anonymous
                  ? "익명으로 자유롭게 이야기 나누어보세요!"
                  : "유용한 정보와 궁금한 점을 물어보세요."}
              </Text>
            </View>
          }
        />
      )}

      {/* Modals */}
      <CreateCommunityPostModal
        visible={createModalVisible}
        initialBoardType={selectedBoard?.is_anonymous ? "anonymous" : "info"}
        boardId={selectedBoardId === ALL_CHILD_BOARDS_ID ? defaultChildBoard?.id || null : selectedBoardId}
        boardName={selectedBoardId === ALL_CHILD_BOARDS_ID ? defaultChildBoard?.name : selectedBoard?.name}
        parentBoardName={selectedParentBoard?.name || selectedBoard?.name}
        boardOptions={orderedChildBoards}
        editPost={editingPost}
        onClose={() => {
          setCreateModalVisible(false);
          setEditingPost(null);
        }}
        onPostCreated={() => fetchCommunityPosts(selectedBoardId, true)}
      />

      <CommunityPostDetailModal
        visible={detailModalVisible}
        postId={selectedPostId}
        onClose={() => setDetailModalVisible(false)}
        onPostUpdated={() => fetchCommunityPosts(selectedBoardId, true)}
      />

      <ImageDetailViewerModal
        visible={viewerVisible}
        media={viewerMedia}
        initialIndex={viewerIndex}
        onClose={() => setViewerVisible(false)}
      />
      <NoticeListModal
        visible={noticeModalVisible}
        onClose={() => setNoticeModalVisible(false)}
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
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
  },
  noticeIconButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 1,
  },
  noticeIconText: {
    fontSize: 13,
    fontWeight: "800",
  },
  headerTitle: {
    display: "none",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.5,
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
  boardArea: {
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  subBoardScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  subBoardChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  postCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  authorGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  anonAvatarBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  userAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  authorText: {
    fontSize: 14,
    fontWeight: "700",
  },
  dateText: {
    fontSize: 12,
  },
  cardBodyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  boardLabel: {
    fontSize: 11,
    fontWeight: "800",
    marginBottom: 4,
  },
  postTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  postCaption: {
    fontSize: 14,
    lineHeight: 20,
  },
  thumbnailImage: {
    width: 72,
    height: 72,
    borderRadius: 10,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 10,
    borderTopWidth: 1,
    gap: 16,
  },
  footerAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  footerActionText: {
    fontSize: 13,
    fontWeight: "600",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyContainer: {
    paddingVertical: 60,
    paddingHorizontal: 20,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    width: "100%",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 6,
    textAlign: "center",
  },
  emptySubText: {
    width: "100%",
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: "center",
    flexWrap: "wrap",
  },
  noticeList: {
    marginBottom: 14,
    gap: 8,
  },
  noticeCard: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
  },
  noticeHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  noticeTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
  },
  noticeContentSnippet: {
    fontSize: 12,
    marginTop: 4,
  },
  noticeExpandedBody: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  noticeContent: {
    fontSize: 13,
    lineHeight: 18,
  },
});
