import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  Image,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import api from "../services/api";
import { getFullImageUrl } from "../config";
import { Comment, CommentNode } from "./CommentsModal";
import { SendPostDmModal } from "./SendPostDmModal";
import { PostCarousel } from "./PostCarousel";
import { HashtagText } from "./HashtagText";
import { getDisplayName } from "../utils/displayName";

const { width, height } = Dimensions.get("window");

interface PostDetailModalProps {
  visible: boolean;
  postId: string | null;
  initialOpenComments?: boolean;
  onClose: () => void;
  onPostUpdated?: () => void;
}

export const PostDetailModal: React.FC<PostDetailModalProps> = ({
  visible,
  postId,
  onClose,
  onPostUpdated,
}) => {
  const navigation = useNavigation<any>();
  const { user: currentUser } = useAuth();
  const { colors } = useTheme();

  const [post, setPost] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [dmModalVisible, setDmModalVisible] = useState<boolean>(false);

  // Inline Comments State
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState<boolean>(false);
  const [inputText, setInputText] = useState<string>("");
  const [submittingComment, setSubmittingComment] = useState<boolean>(false);
  const [replyParentComment, setReplyParentComment] = useState<Comment | null>(null);
  const [editingComment, setEditingComment] = useState<Comment | null>(null);

  const commentInputRef = useRef<TextInput>(null);

  const fetchComments = async (targetPostId: string) => {
    setCommentsLoading(true);
    try {
      const res = await api.get(`/posts/${targetPostId}/comments`);
      if (res.data && res.data.data) {
        setComments(res.data.data);
      }
    } catch (err) {
      console.log("Error fetching comments in detail modal", err);
    } finally {
      setCommentsLoading(false);
    }
  };

  const fetchPostDetail = async (id: string) => {
    setLoading(true);
    try {
      const response = await api.get(`/posts/${id}`);
      if (response.data && response.data.data) {
        setPost(response.data.data);
        fetchComments(id);
      } else {
        throw new Error("Invalid data");
      }
    } catch (err) {
      console.log("Error fetching post detail", err);
      Alert.alert("알림", "존재하지 않거나 삭제된 게시물입니다.");
      onClose();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible && postId) {
      setReplyParentComment(null);
      setEditingComment(null);
      setInputText("");
      fetchPostDetail(postId);
    } else {
      setPost(null);
      setComments([]);
    }
  }, [visible, postId]);

  const handleToggleFollowUser = async (username: string, currentIsFollowing: boolean) => {
    setPost((prev: any) =>
      prev && prev.user ? { ...prev, user: { ...prev.user, is_following: !currentIsFollowing } } : prev
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
      setPost((prev: any) =>
        prev?.user
          ? {
              ...prev,
              user: { ...prev.user, is_following: confirmedIsFollowing },
            }
          : prev
      );
      if (onPostUpdated) onPostUpdated();
    } catch (err) {
      console.log("Error toggling follow in detail modal", err);
      if (postId) fetchPostDetail(postId);
    }
  };

  const handleMoreOptions = () => {
    if (!post || !post.user?.username) return;
    const authorUsername = post.user.username;
    const isMe = post.is_mine || (currentUser && currentUser.username === authorUsername);

    if (isMe) {
      Alert.alert(
        "내 게시물",
        "원하시는 작업을 선택하세요.",
        [
          {
            text: "수정하기",
            onPress: () => {
              onClose();
              navigation.navigate("CreatePost", { editPost: post, onPostUpdated });
            },
          },
          {
            text: post.visibility === "private" ? "전체 공개로 변경" : "비공개로 변경",
            onPress: async () => {
              try {
                const nextVisibility =
                  post.visibility === "private" ? "public" : "private";
                await api.patch(`/posts/${post.id}`, {
                  visibility: nextVisibility,
                });
                setPost((prev: any) =>
                  prev ? { ...prev, visibility: nextVisibility } : null
                );
                Alert.alert(
                  "완료",
                  nextVisibility === "public"
                    ? "게시물이 전체 공개로 변경되었습니다."
                    : "게시물이 비공개로 변경되었습니다."
                );
                if (onPostUpdated) onPostUpdated();
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
                      await api.delete(`/posts/${post.id}`);
                      if (onPostUpdated) onPostUpdated();
                      onClose();
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

    const isFollowing = post.user.is_following || false;

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
          text: "취소",
          style: "cancel",
        },
      ],
      { cancelable: true }
    );
  };

  const handleToggleLike = async () => {
    if (!post) return;
    const currentIsLiked = post.is_liked;
    const currentLikesCount = post.likes_count || 0;
    const nextIsLiked = !currentIsLiked;
    const nextLikesCount = nextIsLiked ? currentLikesCount + 1 : Math.max(0, currentLikesCount - 1);

    setPost({ ...post, is_liked: nextIsLiked, likes_count: nextLikesCount });

    try {
      const res = await api.post(`/posts/${post.id}/like`);
      if (res.data && res.data.data) {
        setPost((prev: any) =>
          prev ? { ...prev, is_liked: res.data.data.is_liked, likes_count: res.data.data.likes_count } : null
        );
        if (onPostUpdated) onPostUpdated();
      }
    } catch (err) {
      console.log("Error toggling like in detail modal", err);
      fetchPostDetail(post.id);
    }
  };

  const handleToggleBookmark = async () => {
    if (!post) return;
    const nextIsBookmarked = !post.is_bookmarked;
    setPost({ ...post, is_bookmarked: nextIsBookmarked });

    try {
      const res = await api.post(`/posts/${post.id}/bookmark`);
      if (res.data && res.data.data) {
        setPost((prev: any) =>
          prev ? { ...prev, is_bookmarked: res.data.data.is_bookmarked } : null
        );
        if (onPostUpdated) onPostUpdated();
      }
    } catch (err) {
      console.log("Error toggling bookmark in detail modal", err);
      fetchPostDetail(post.id);
    }
  };

  // Comment Handlers
  const handlePressReply = (comment: Comment) => {
    setEditingComment(null);
    setReplyParentComment(comment);
    setInputText(`@${comment.user.username} `);
    commentInputRef.current?.focus();
  };

  const handleCancelReply = () => {
    setReplyParentComment(null);
    setInputText("");
  };

  const handleEditComment = (comment: Comment) => {
    setReplyParentComment(null);
    setEditingComment(comment);
    setInputText(comment.content);
    commentInputRef.current?.focus();
  };

  const handleCancelEdit = () => {
    setEditingComment(null);
    setInputText("");
  };

  const handleAddComment = async () => {
    if (!inputText.trim() || !post) return;
    setSubmittingComment(true);
    try {
      if (editingComment) {
        const response = await api.patch(`/posts/comments/${editingComment.id}`, {
          content: inputText.trim(),
        });
        if (response.data) {
          setInputText("");
          setEditingComment(null);
          fetchComments(post.id);
        }
      } else {
        const targetParentId = replyParentComment
          ? (replyParentComment.parent_id || replyParentComment.id)
          : null;

        const response = await api.post(`/posts/${post.id}/comments`, {
          content: inputText.trim(),
          parent_id: targetParentId,
        });
        if (response.data) {
          setInputText("");
          setReplyParentComment(null);
          fetchComments(post.id);
          setPost((prev: any) => (prev ? { ...prev, comments_count: (prev.comments_count || 0) + 1 } : prev));
          if (onPostUpdated) onPostUpdated();
        }
      }
    } catch (err: any) {
      console.log("Error adding comment in detail modal", err?.response?.data || err);
      const errMsg = err?.response?.data?.message || err?.response?.data?.detail || "댓글 작성에 실패했습니다.";
      Alert.alert("알림", typeof errMsg === "string" ? errMsg : "댓글 작성에 실패했습니다.");
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    Alert.alert("댓글 삭제", "정말로 이 댓글을 삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/posts/comments/${commentId}`);
            if (post) {
              fetchComments(post.id);
              setPost((prev: any) => (prev ? { ...prev, comments_count: Math.max(0, (prev.comments_count || 0) - 1) } : prev));
            }
            if (onPostUpdated) onPostUpdated();
          } catch (err) {
            console.log("Failed to delete comment in detail modal", err);
            Alert.alert("오류", "댓글 삭제에 실패했습니다.");
          }
        },
      },
    ]);
  };

  if (!visible) return null;

  const commentsCount = post?.comments_count || 0;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>게시물</Text>
          <View style={{ width: 30 }} />
        </View>

        {loading || !post ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.accentBlue} />
          </View>
        ) : (
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1 }}
          >
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
              {/* Post User Header */}
              <View style={styles.postHeader}>
                <View style={styles.userInfo}>
                  <Image
                    source={{
                      uri: getFullImageUrl(post.user?.profile_image_url),
                    }}
                    style={styles.avatar}
                  />
                  <View>
                    <Text style={[styles.username, { color: colors.textPrimary }]}>{getDisplayName(post.user)}</Text>
                    {post.location ? <Text style={[styles.location, { color: colors.textSecondary }]}>{post.location}</Text> : null}
                  </View>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  {currentUser && currentUser.username === post.user?.username && (
                    <>
                      <TouchableOpacity
                        style={{ padding: 4 }}
                        onPress={() => {
                          onClose();
                          navigation.navigate("CreatePost", { editPost: post, onPostUpdated });
                        }}
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
                                  await api.delete(`/posts/${post.id}`);
                                  if (onPostUpdated) onPostUpdated();
                                  onClose();
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
                  <TouchableOpacity style={{ padding: 4 }} onPress={handleMoreOptions}>
                    <Ionicons name="ellipsis-horizontal" size={20} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Main Image Carousel */}
              {post.media && post.media.length > 0 ? (
                <PostCarousel media={post.media} enableZoomViewer={true} />
              ) : (
                <View style={[styles.postImage, styles.noMedia, { backgroundColor: colors.bgCard }]}>
                  <Text style={{ color: colors.textMuted }}>이미지 없음</Text>
                </View>
              )}

              {/* Action Bar without Dividers */}
              <View style={styles.actionRow}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                  <TouchableOpacity onPress={handleToggleLike}>
                    <Ionicons
                      name={post.is_liked ? "heart" : "heart-outline"}
                      size={24}
                      color={post.is_liked ? "#ed4956" : colors.textPrimary}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => commentInputRef.current?.focus()}>
                    <Ionicons name="chatbubble-outline" size={22} color={colors.textPrimary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setDmModalVisible(true)}>
                    <Ionicons name="paper-plane-outline" size={22} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>

                {/* Bookmark Button (Shifted slightly left) */}
                <TouchableOpacity onPress={handleToggleBookmark} style={{ paddingRight: 8, marginRight: 2 }}>
                  <Ionicons
                    name={post.is_bookmarked ? "bookmark" : "bookmark-outline"}
                    size={23}
                    color={colors.textPrimary}
                  />
                </TouchableOpacity>
              </View>

              {/* Details & Caption */}
              <View style={styles.postDetails}>
                <Text style={[styles.likesText, { color: colors.textPrimary }]}>좋아요 {post.likes_count || 0}개</Text>
                
                {post.caption ? (
                  <View style={{ paddingVertical: 6 }}>
                    <HashtagText text={post.caption} style={{ fontSize: 14, lineHeight: 20 }} />
                  </View>
                ) : null}

                <Text style={[styles.timeText, { color: colors.textMuted, marginTop: 4, marginBottom: 12 }]}>
                  {new Date(post.created_at).toLocaleDateString("ko-KR")}
                </Text>

                {/* ── 📌 모든 댓글 바로 보기 영역 (구분선 삭제) ── */}
                <View style={{ paddingTop: 8 }}>
                  <Text style={{ fontSize: 15, fontWeight: "bold", color: colors.textPrimary, marginBottom: 10 }}>
                    댓글 ({commentsCount}개)
                  </Text>

                  {commentsLoading ? (
                    <View style={{ paddingVertical: 16, alignItems: "center" }}>
                      <ActivityIndicator size="small" color={colors.accentBlue} />
                    </View>
                  ) : comments && comments.length > 0 ? (
                    <View>
                      {comments.map((comment) => (
                        <CommentNode
                          key={comment.id}
                          comment={comment}
                          depth={0}
                          currentUser={currentUser}
                          colors={colors}
                          onPressReply={handlePressReply}
                          onDeleteComment={handleDeleteComment}
                          onEditComment={handleEditComment}
                        />
                      ))}
                    </View>
                  ) : (
                    <View style={{ paddingVertical: 16, alignItems: "center", width: "100%" }}>
                      <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: "center", width: "100%", lineHeight: 18, paddingHorizontal: 16 }}>
                        아직 댓글이 없습니다. 첫 댓글을 작성해보세요!
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </ScrollView>

            {/* Target Reply Bar if replyParentComment is set */}
            {replyParentComment && (
              <View style={[styles.replyingBar, { backgroundColor: colors.bgInput }]}>
                <Text style={[styles.replyingText, { color: colors.textSecondary }]}>
                  <Text style={{ fontWeight: "bold", color: colors.accentBlue }}>{getDisplayName(replyParentComment.user)}</Text> 님에게 답글 작성 중
                </Text>
                <TouchableOpacity onPress={handleCancelReply} style={styles.cancelReplyBtn}>
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            )}

            {/* Editing Comment Bar if editingComment is set */}
            {editingComment && (
              <View style={[styles.replyingBar, { backgroundColor: colors.bgInput }]}>
                <Text style={[styles.replyingText, { color: colors.textSecondary }]}>
                  ✏️ <Text style={{ fontWeight: "bold", color: colors.accentPurple || "#a855f7" }}>댓글 수정 중</Text>
                </Text>
                <TouchableOpacity onPress={handleCancelEdit} style={styles.cancelReplyBtn}>
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            )}

            {/* Bottom Sticky Comment Input Bar */}
            <View style={[styles.inputContainer, { backgroundColor: colors.bgCard }]}>
              <TextInput
                ref={commentInputRef}
                style={[styles.textInput, { color: colors.textPrimary, backgroundColor: colors.bgInput, borderColor: colors.borderColor, borderWidth: 1 }]}
                placeholder={
                  replyParentComment
                    ? `${getDisplayName(replyParentComment.user)} 님에게 답글 달기...`
                    : "댓글 달기..."
                }
                placeholderTextColor={colors.textSecondary}
                value={inputText}
                onChangeText={setInputText}
                multiline
              />
              <TouchableOpacity
                onPress={handleAddComment}
                disabled={!inputText.trim() || submittingComment}
                style={styles.postBtn}
              >
                {submittingComment ? (
                  <ActivityIndicator size="small" color={colors.accentBlue} />
                ) : (
                  <Text
                    style={[
                      styles.postBtnText,
                      { color: inputText.trim() ? colors.accentBlue : colors.textMuted },
                    ]}
                  >
                    게시
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        )}

        {/* Send Post by DM Modal */}
        <SendPostDmModal
          visible={dmModalVisible}
          post={post}
          onClose={() => setDmModalVisible(false)}
        />
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  header: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  closeBtn: {
    padding: 6,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  postHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
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
  },
  location: {
    color: "#8e8e8e",
    fontSize: 12,
  },
  postImage: {
    width: width - 24,
    height: (width - 24) * 1.25,
    borderRadius: 16,
    alignSelf: "center",
    marginVertical: 6,
    backgroundColor: "#1c1c1e",
  },
  noMedia: {
    justifyContent: "center",
    alignItems: "center",
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingLeft: 18,
    paddingRight: 12,
    paddingVertical: 10,
  },
  postDetails: {
    paddingHorizontal: 18,
    paddingBottom: 20,
  },
  likesText: {
    color: "#fff",
    fontWeight: "bold",
    marginBottom: 4,
  },
  timeText: {
    color: "#8e8e8e",
    fontSize: 11,
  },
  replyingBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  replyingText: {
    fontSize: 13,
  },
  cancelReplyBtn: {
    padding: 2,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
    marginRight: 6,
  },
  postBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  postBtnText: {
    fontWeight: "bold",
    fontSize: 14,
  },
});
