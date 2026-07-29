import React, { useEffect, useLayoutEffect, useState } from "react";
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
import { getFullImageUrl } from "../config";
import { CreateCommunityPostModal } from "../components/CreateCommunityPostModal";
import { CommunityPostDetailModal } from "../components/CommunityPostDetailModal";
import { ImageDetailViewerModal } from "../components/ImageDetailViewerModal";
import { AuraLogoText } from "../components/AuraLogoText";
import { AdminAvatar, AdminBadge } from "../components/AdminIdentity";
import { VerifiedYouTubeCard } from "../components/VerifiedYouTubeCard";

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
const isPartnerBoardRecord = (board: any) =>
  String(board?.slug || "").toLowerCase().includes("partner")
  || String(board?.name || "").includes(PARTNER_BOARD_NAME);

export const CommunityScreen = ({ navigation, route }: any) => {
  const { colors } = useTheme();
  const { setCommunityComposeDisabled } = useContextualCompose();
  const isFocused = useIsFocused();
  const { user: currentUser } = useAuth();
  const requestedSection: CommunitySection = route?.params?.section === "partner"
    ? "partner"
    : route?.params?.section === "info"
      ? "info"
      : "anonymous";
  const [section, setSection] = useState<CommunitySection>(requestedSection);
  const [boards, setBoards] = useState<any[]>([]);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [notices, setNotices] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Modals
  const [createModalVisible, setCreateModalVisible] = useState<boolean>(false);
  const [editingPost, setEditingPost] = useState<any | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState<boolean>(false);

  // Image Viewer State
  const [viewerVisible, setViewerVisible] = useState<boolean>(false);
  const [viewerMedia, setViewerMedia] = useState<any[]>([]);
  const [viewerIndex, setViewerIndex] = useState<number>(0);

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

  const selectFirstBoard = (list: any[], nextSection: CommunitySection) => {
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
      const res = await api.get("/community/boards");
      const list = res.data?.data || [];
      setBoards(list);
    } catch (err) {
      console.log("Error fetching community boards", err);
      setBoards([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchCommunityPosts = async (boardId: string | null) => {
    if (!boardId) {
      setPosts([]);
      setNotices([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const isAllChildren = boardId === ALL_CHILD_BOARDS_ID;
      const queryBoardId = isAllChildren ? selectedParentId : boardId;
      const [postRes, noticeRes] = await Promise.all([
        api.get(isAllChildren ? `/posts/community?parent_board_id=${selectedParentId}` : `/posts/community?board_id=${boardId}`),
        api.get(`/community/notices?board_id=${queryBoardId}`),
      ]);
      if (postRes.data && postRes.data.data) {
        const list = postRes.data.data || [];
        setPosts(list);
      }
      setNotices(noticeRes.data?.data || []);
    } catch (err) {
      console.log("Error fetching community posts", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchBoards();
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
    setLoading(true);
    fetchCommunityPosts(selectedBoardId);
  }, [selectedBoardId, selectedParentId]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchBoards();
    fetchCommunityPosts(selectedBoardId);
  };

  const handleToggleLike = async (postId: string) => {
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

    try {
      const res = await api.post(`/posts/${postId}/like`);
      if (res.data && res.data.data) {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId
              ? { ...p, is_liked: res.data.data.is_liked, likes_count: res.data.data.likes_count }
              : p
          )
        );
      }
    } catch (e) {
      console.log("Error toggling like", e);
    }
  };

  const renderPostItem = ({ item }: { item: any }) => {
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
        onPress={() => {
          setSelectedPostId(item.id);
          setDetailModalVisible(true);
        }}
        activeOpacity={0.8}
      >
        {/* Header (Author & Date & Edit/Delete for Owner) */}
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
                    setEditingPost(item);
                    setCreateModalVisible(true);
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
                        onPress: async () => {
                          try {
                            await api.delete(`/posts/${item.id}`);
                            setPosts((prev) => prev.filter((p) => p.id !== item.id));
                          } catch (err) {
                            Alert.alert("오류", "삭제에 실패했습니다.");
                          }
                        },
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
                setViewerMedia(item.media && item.media.length > 0 ? item.media : [{ media_url: mediaUrl }]);
                setViewerIndex(0);
                setViewerVisible(true);
              }}
              activeOpacity={0.85}
            >
              <Image source={{ uri: getFullImageUrl(mediaUrl) }} style={styles.thumbnailImage} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Footer (Likes & Comments) */}
        <View style={[styles.cardFooter, { borderTopColor: colors.borderColor || "#27272a" }]}>
          <TouchableOpacity
            style={styles.footerAction}
            onPress={(e) => {
              e.stopPropagation();
              handleToggleLike(item.id);
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
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary || "#09090b" }]}>
      {/* Top Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.borderLight }]}>
        <AuraLogoText fontSize={26} />
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>커뮤니티</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={[styles.headerIconButton, { backgroundColor: colors.bgInput }]} onPress={() => navigation.navigate("Search")}>
            <Ionicons name="search-outline" size={21} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.headerIconButton, { backgroundColor: colors.bgInput }]} onPress={() => navigation.navigate("Notification")}>
            <Ionicons name="notifications-outline" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.sectionTabs, { borderBottomColor: colors.borderLight }]}
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

      <View style={styles.boardArea}>
        {visibleChildBoards.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subBoardScroll}>
            {visibleChildBoards.map((board) => (
              <TouchableOpacity key={board.id} style={[styles.subBoardChip, { backgroundColor: selectedBoardId === board.id ? colors.accentPurple + "12" : "transparent", borderColor: selectedBoardId === board.id ? colors.accentPurple : colors.borderColor }]} onPress={() => setSelectedBoardId(board.id)}>
                <Text style={{ color: selectedBoardId === board.id ? colors.accentBlue : colors.textSecondary, fontWeight: "700" }}>{board.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Post List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accentPurple || "#a855f7"} />
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={renderPostItem}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={<>
            {section === "info" && <LinearGradient colors={[colors.accentPurple + "22", colors.accentPink + "34", colors.accentCyan + "22"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.supportCard, { borderColor: colors.borderLight }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.supportTitle, { color: colors.textPrimary }]}>도움이 필요할 때</Text>
                <Text style={[styles.supportBody, { color: colors.textSecondary }]}>혼자가 아니에요. 안전하고 익명으로 필요한 도움과 정보를 찾아보세요.</Text>
                <TouchableOpacity style={[styles.supportButton, { backgroundColor: colors.bgCard }]} onPress={() => changeSection("info")}>
                  <Text style={[styles.supportButtonText, { color: colors.accentPurple }]}>자세히 보기</Text>
                  <Ionicons name="arrow-forward" size={15} color={colors.accentPurple} />
                </TouchableOpacity>
              </View>
              <View style={[styles.supportIcon, { backgroundColor: colors.bgCard + "aa" }]}><Ionicons name="heart-outline" size={34} color={colors.accentPink} /></View>
            </LinearGradient>}
            {notices.length ? <View style={styles.noticeList}>{notices.map((notice) => <View key={notice.id} style={[styles.noticeCard, { backgroundColor: colors.bgCard, borderColor: colors.accentPurple }]}><Ionicons name="megaphone-outline" size={16} color={colors.accentPurple} /><View style={{ flex: 1 }}><Text style={[styles.noticeTitle, { color: colors.textPrimary }]}>{notice.title}</Text><Text style={[styles.noticeContent, { color: colors.textSecondary }]} numberOfLines={2}>{notice.content}</Text></View></View>)}</View> : null}
          </>}
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
              <Text style={[styles.emptySubText, { color: colors.textSecondary }]}>
                {selectedBoard?.is_anonymous
                  ? "익명으로 자유롭게 이야기 나누어보세요!"
                  : "유용한 정보와 궁금한 점을 공유해보세요!"}
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
        onPostCreated={() => fetchCommunityPosts(selectedBoardId)}
      />

      <CommunityPostDetailModal
        visible={detailModalVisible}
        postId={selectedPostId}
        onClose={() => setDetailModalVisible(false)}
        onPostUpdated={() => fetchCommunityPosts(selectedBoardId)}
      />

      <ImageDetailViewerModal
        visible={viewerVisible}
        media={viewerMedia}
        initialIndex={viewerIndex}
        onClose={() => setViewerVisible(false)}
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
    borderBottomWidth: 1,
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    display: "none",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.5,
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
    width: 42,
    height: 3,
    borderRadius: 3,
  },
  tabContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  boardArea: { paddingVertical: 10 },
  boardScroll: { paddingHorizontal: 16, gap: 8 },
  subBoardScroll: { paddingHorizontal: 16, paddingTop: 8, gap: 8 },
  boardChip: { paddingHorizontal: 16, height: 38, borderRadius: 19, borderWidth: 1, justifyContent: "center" },
  subBoardChip: { paddingHorizontal: 14, height: 34, borderRadius: 17, borderWidth: 1, justifyContent: "center" },
  noticeList: { marginBottom: 12, gap: 8 },
  noticeCard: { flexDirection: "row", gap: 8, borderWidth: 1, borderRadius: 10, padding: 10 },
  noticeTitle: { fontSize: 13, fontWeight: "800", marginBottom: 2 },
  noticeContent: { fontSize: 12, lineHeight: 17 },
  supportCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    overflow: "hidden",
  },
  supportTitle: { fontSize: 20, fontWeight: "800", marginBottom: 7 },
  supportBody: { fontSize: 13, lineHeight: 19, maxWidth: 220 },
  supportButton: {
    marginTop: 14,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  supportButtonText: { fontSize: 12, fontWeight: "800" },
  supportIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  capsuleBackground: {
    flexDirection: "row",
    borderRadius: 25,
    padding: 4,
    height: 48,
  },
  tabButton: {
    flex: 1,
    height: "100%",
    borderRadius: 21,
    overflow: "hidden",
  },
  activeGradientTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
  },
  inactiveTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
  },
  activeTabText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  inactiveTabText: {
    fontSize: 14,
    fontWeight: "600",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  postCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  authorGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  anonAvatarBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  userAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  authorText: {
    fontSize: 13,
    fontWeight: "600",
  },
  dateText: {
    fontSize: 11,
  },
  cardBodyRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  postTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  boardLabel: { fontSize: 12, fontWeight: "800", marginBottom: 6 },
  postCaption: {
    fontSize: 13,
    lineHeight: 18,
  },
  thumbnailImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
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
    fontSize: 12,
    fontWeight: "600",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    width: "100%",
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 22,
    marginBottom: 6,
    textAlign: "center",
    width: "100%",
    paddingHorizontal: 16,
  },
  emptySubText: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    width: "100%",
    paddingHorizontal: 16,
  },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    shadowColor: "#7652df",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  fabGradient: {
    width: "100%",
    height: "100%",
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
  },
});
