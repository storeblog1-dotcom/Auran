import React, { useEffect, useState } from "react";
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
import api from "../services/api";
import { getFullImageUrl } from "../config";
import { CreateCommunityPostModal } from "../components/CreateCommunityPostModal";
import { CommunityPostDetailModal } from "../components/CommunityPostDetailModal";
import { ImageDetailViewerModal } from "../components/ImageDetailViewerModal";

const { width } = Dimensions.get("window");

export const CommunityScreen = ({ navigation }: any) => {
  const { colors } = useTheme();
  const { user: currentUser } = useAuth();
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

  const selectedBoard = boards.find((board) => board.id === selectedBoardId);
  const parentBoards = boards.filter((board) => !board.parent_id);
  const childBoards = boards.filter((board) => board.parent_id === selectedParentId);

  const fetchBoards = async () => {
    try {
      const res = await api.get("/community/boards");
      const list = res.data?.data || [];
      setBoards(list);
      if (!selectedParentId && list.length) {
        const first = list.find((board: any) => board.slug === "anonymous") || list.find((board: any) => !board.parent_id);
        setSelectedParentId(first?.id || null);
        setSelectedBoardId(first?.id || null);
      }
    } catch (err) { console.log("Error fetching community boards", err); }
  };

  const fetchCommunityPosts = async (boardId: string | null) => {
    if (!boardId) return;
    try {
      const [postRes, noticeRes] = await Promise.all([
        api.get(`/posts/community?board_id=${boardId}`),
        api.get(`/community/notices?board_id=${boardId}`),
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

  useEffect(() => {
    setLoading(true);
    fetchCommunityPosts(selectedBoardId);
  }, [selectedBoardId]);

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
            {isAnonymous ? (
              <View style={[styles.anonAvatarBadge, { backgroundColor: "rgba(139, 92, 246, 0.15)" }]}>
                <Ionicons name="eye-off" size={14} color={colors.accentPurple || "#a855f7"} />
              </View>
            ) : (
              <Image
                source={{ uri: getFullImageUrl(item.user?.profile_image_url) }}
                style={styles.userAvatar}
              />
            )}
            <Text style={[styles.authorText, { color: colors.textPrimary }]}>
              {isAnonymous ? "익명" : item.user?.username || "사용자"}
            </Text>
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
      <View style={[styles.header, { borderBottomColor: colors.borderColor || "#27272a" }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 6 }}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>커뮤니티</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.boardArea}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.boardScroll}>
          {parentBoards.map((board) => (
            <TouchableOpacity key={board.id} style={[styles.boardChip, { backgroundColor: selectedParentId === board.id ? colors.accentPurple : colors.bgCard }]} onPress={() => { setSelectedParentId(board.id); const firstChild = boards.find((item) => item.parent_id === board.id); setSelectedBoardId(firstChild?.id || board.id); }}>
              <Text style={{ color: selectedParentId === board.id ? "#fff" : colors.textPrimary, fontWeight: "700" }}>{board.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {childBoards.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subBoardScroll}>
            {childBoards.map((board) => (
              <TouchableOpacity key={board.id} style={[styles.subBoardChip, { borderColor: selectedBoardId === board.id ? colors.accentBlue : colors.borderColor }]} onPress={() => setSelectedBoardId(board.id)}>
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
          ListHeaderComponent={notices.length ? <View style={styles.noticeList}>{notices.map((notice) => <View key={notice.id} style={[styles.noticeCard, { backgroundColor: colors.bgCard, borderColor: colors.accentPurple }]}><Ionicons name="megaphone-outline" size={16} color={colors.accentPurple} /><View style={{ flex: 1 }}><Text style={[styles.noticeTitle, { color: colors.textPrimary }]}>{notice.title}</Text><Text style={[styles.noticeContent, { color: colors.textSecondary }]} numberOfLines={2}>{notice.content}</Text></View></View>)}</View> : null}
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

      {/* Floating Action Button (FAB) */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          setEditingPost(null);
          setCreateModalVisible(true);
        }}
        activeOpacity={0.9}
      >
        <LinearGradient
          colors={["#8b5cf6", "#ec4899", "#06b6d4"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabGradient}
        >
          <Ionicons name="create-outline" size={24} color="#ffffff" />
        </LinearGradient>
      </TouchableOpacity>

      {/* Modals */}
      <CreateCommunityPostModal
        visible={createModalVisible}
        initialBoardType={selectedBoard?.is_anonymous ? "anonymous" : "info"}
        boardId={selectedBoardId}
        boardName={selectedBoard?.name}
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
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  tabContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  boardArea: { paddingVertical: 10 },
  boardScroll: { paddingHorizontal: 16, gap: 8 },
  subBoardScroll: { paddingHorizontal: 16, paddingTop: 8, gap: 8 },
  boardChip: { paddingHorizontal: 16, height: 38, borderRadius: 19, justifyContent: "center" },
  subBoardChip: { paddingHorizontal: 14, height: 34, borderRadius: 17, borderWidth: 1, justifyContent: "center" },
  noticeList: { marginBottom: 12, gap: 8 },
  noticeCard: { flexDirection: "row", gap: 8, borderWidth: 1, borderRadius: 10, padding: 10 },
  noticeTitle: { fontSize: 13, fontWeight: "800", marginBottom: 2 },
  noticeContent: { fontSize: 12, lineHeight: 17 },
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
    shadowColor: "#8b5cf6",
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
