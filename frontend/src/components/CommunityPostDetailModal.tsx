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
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { getDisplayName } from "../utils/displayName";
import api from "../services/api";
import { getFullImageUrl } from "../config";
import { Comment, CommentNode } from "./CommentsModal";

import { CreateCommunityPostModal } from "./CreateCommunityPostModal";
import { ImageDetailViewerModal } from "./ImageDetailViewerModal";

const { width } = Dimensions.get("window");

interface CommunityPostDetailModalProps {
  visible: boolean;
  postId: string | null;
  onClose: () => void;
  onPostUpdated?: () => void;
}

export const CommunityPostDetailModal: React.FC<CommunityPostDetailModalProps> = ({
  visible,
  postId,
  onClose,
  onPostUpdated,
}) => {
  const { user: currentUser } = useAuth();
  const { colors } = useTheme();

  const [post, setPost] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [editModalVisible, setEditModalVisible] = useState<boolean>(false);
  const [viewerVisible, setViewerVisible] = useState<boolean>(false);

  // Comments State
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
      console.log("Error fetching comments in community detail modal", err);
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
      }
    } catch (err) {
      console.log("Error fetching community post detail", err);
      Alert.alert("오류", "게시글을 불러오지 못했습니다.");
      onClose();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible && postId) {
      setEditingComment(null);
      setReplyParentComment(null);
      setInputText("");
      fetchPostDetail(postId);
      fetchComments(postId);
    } else {
      setPost(null);
      setComments([]);
      setReplyParentComment(null);
      setEditingComment(null);
      setInputText("");
    }
  }, [visible, postId]);

  const handleToggleLike = async () => {
    if (!post) return;
    const nextIsLiked = !post.is_liked;
    const nextCount = nextIsLiked ? (post.likes_count || 0) + 1 : Math.max(0, (post.likes_count || 0) - 1);

    setPost({ ...post, is_liked: nextIsLiked, likes_count: nextCount });

    try {
      const res = await api.post(`/posts/${post.id}/like`);
      if (res.data && res.data.data) {
        setPost((prev: any) =>
          prev ? { ...prev, is_liked: res.data.data.is_liked, likes_count: res.data.data.likes_count } : prev
        );
        if (onPostUpdated) onPostUpdated();
      }
    } catch (e) {
      console.log("Error toggling like", e);
    }
  };

  const handleCreateComment = async () => {
    if (!inputText.trim() || !post) return;
    setSubmittingComment(true);

    try {
      if (editingComment) {
        await api.patch(`/posts/comments/${editingComment.id}`, {
          content: inputText.trim(),
        });
        setInputText("");
        setEditingComment(null);
        fetchComments(post.id);
      } else {
        await api.post(`/posts/${post.id}/comments`, {
          content: inputText.trim(),
          parent_id: replyParentComment ? replyParentComment.id : undefined,
          mention_user_id: replyParentComment?.user.id,
        });

        setInputText("");
        setReplyParentComment(null);
        fetchComments(post.id);
        setPost((prev: any) =>
          prev ? { ...prev, comments_count: (prev.comments_count || 0) + 1 } : prev
        );
        if (onPostUpdated) onPostUpdated();
      }
    } catch (err) {
      console.log("Error posting/editing comment", err);
      Alert.alert("오류", editingComment ? "댓글 수정에 실패했습니다." : "댓글 작성에 실패했습니다.");
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleReplyPress = (comment: Comment) => {
    setEditingComment(null);
    setReplyParentComment(comment);
    if (commentInputRef.current) {
      commentInputRef.current.focus();
    }
  };

  const handleEditComment = (comment: Comment) => {
    setReplyParentComment(null);
    setEditingComment(comment);
    setInputText(comment.content);
    if (commentInputRef.current) {
      commentInputRef.current.focus();
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!post) return;
    Alert.alert("댓글 삭제", "정말 이 댓글을 삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/posts/comments/${commentId}`);
            fetchComments(post.id);
            setPost((prev: any) =>
              prev ? { ...prev, comments_count: Math.max(0, (prev.comments_count || 0) - 1) } : prev
            );
            if (onPostUpdated) onPostUpdated();
          } catch (e) {
            Alert.alert("오류", "댓글 삭제에 실패했습니다.");
          }
        },
      },
    ]);
  };

  const handleDeletePost = () => {
    if (!post) return;
    Alert.alert("게시글 삭제", "정말 이 게시글을 삭제하시겠습니까?", [
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
            Alert.alert("오류", "게시글 삭제에 실패했습니다.");
          }
        },
      },
    ]);
  };

  const isAnonymous = post?.board_type === "anonymous";
  const isMe = post?.is_mine || (currentUser && post?.user?.username === currentUser.username);

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
        <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary || "#09090b" }]}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1 }}
          >
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.borderColor || "#27272a" }]}>
              <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
                <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
              </TouchableOpacity>
              <View style={styles.badgeContainer}>
                <Text style={styles.badgeText}>
                  {isAnonymous ? "익명게시판" : "정보게시판"}
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                {isMe && (
                  <>
                    <TouchableOpacity onPress={() => setEditModalVisible(true)} style={{ padding: 4 }}>
                      <Ionicons name="create-outline" size={22} color={colors.accentPurple || "#a855f7"} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleDeletePost} style={{ padding: 4 }}>
                      <Ionicons name="trash-outline" size={22} color="#ef4444" />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>

            {loading || !post ? (
              <View style={styles.loadingCenter}>
                <ActivityIndicator size="large" color={colors.accentPurple || "#a855f7"} />
              </View>
            ) : (
              <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Author & Timestamp */}
                <View style={styles.authorRow}>
                  {isAnonymous ? (
                    <View style={[styles.anonAvatar, { backgroundColor: colors.bgCard || "#27272a" }]}>
                      <Ionicons name="eye-off" size={20} color={colors.accentPurple || "#a855f7"} />
                    </View>
                  ) : (
                    <Image
                      source={{ uri: getFullImageUrl(post.user?.profile_image_url) }}
                      style={styles.userAvatar}
                    />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.authorName, { color: colors.textPrimary }]}>
                      {isAnonymous ? "익명" : getDisplayName(post.user)}
                    </Text>
                    <Text style={[styles.timeText, { color: colors.textSecondary }]}>
                      {new Date(post.created_at).toLocaleString("ko-KR", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                  </View>
                </View>

                {/* Title & Caption */}
                {post.title ? (
                  <Text style={[styles.postTitle, { color: colors.textPrimary }]}>{post.title}</Text>
                ) : null}
                <Text style={[styles.postBody, { color: colors.textPrimary }]}>{post.caption}</Text>

                {/* Media Image */}
                {post.media && post.media.length > 0 ? (
                  <TouchableOpacity
                    style={styles.mediaContainer}
                    onPress={() => setViewerVisible(true)}
                    activeOpacity={0.9}
                  >
                    <Image
                      source={{ uri: getFullImageUrl(post.media[0].media_url) }}
                      style={styles.mediaImage}
                      resizeMode="cover"
                    />
                    <View style={styles.zoomHintBadge}>
                      <Ionicons name="expand-outline" size={14} color="#ffffff" />
                      <Text style={styles.zoomHintText}>원본 보기</Text>
                    </View>
                  </TouchableOpacity>
                ) : null}

                {/* Action Bar */}
                <View style={[styles.actionBar, { borderTopColor: colors.borderColor || "#27272a", borderBottomColor: colors.borderColor || "#27272a" }]}>
                  <TouchableOpacity style={styles.actionItem} onPress={handleToggleLike}>
                    <Ionicons
                      name={post.is_liked ? "heart" : "heart-outline"}
                      size={22}
                      color={post.is_liked ? "#ec4899" : colors.textPrimary}
                    />
                    <Text style={[styles.actionCount, { color: post.is_liked ? "#ec4899" : colors.textPrimary }]}>
                      {post.likes_count || 0}
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.actionItem}>
                    <Ionicons name="chatbubble-outline" size={20} color={colors.textPrimary} />
                    <Text style={[styles.actionCount, { color: colors.textPrimary }]}>
                      {post.comments_count || 0}
                    </Text>
                  </View>
                </View>

                {/* Comments Header */}
                <Text style={[styles.commentsSectionTitle, { color: colors.textPrimary }]}>
                  댓글 {post.comments_count || 0}개
                </Text>

                {/* Comments List */}
                {commentsLoading ? (
                  <ActivityIndicator size="small" color={colors.accentPurple || "#a855f7"} style={{ marginVertical: 16 }} />
                ) : comments.length === 0 ? (
                  <Text style={[styles.noCommentsText, { color: colors.textSecondary }]}>
                    아직 댓글이 없습니다. 첫 댓글을 작성해보세요!
                  </Text>
                ) : (
                  comments.map((comment) => (
                    <CommentNode
                      key={comment.id}
                      comment={comment}
                      currentUser={currentUser}
                      colors={colors}
                      onPressReply={handleReplyPress}
                      onDeleteComment={handleDeleteComment}
                      onEditComment={handleEditComment}
                    />
                  ))
                )}
              </ScrollView>
            )}

            {/* Comment Input Footer */}
            {post && (
              <View style={[styles.footerInputContainer, { backgroundColor: colors.bgCard || "#18181b", borderTopColor: colors.borderColor || "#27272a" }]}>
                {editingComment ? (
                  <View style={styles.replyBanner}>
                    <Text style={[styles.replyBannerText, { color: colors.textSecondary }]}>
                      ✏️ <Text style={{ fontWeight: "bold", color: colors.accentPurple || "#a855f7" }}>댓글 수정 중</Text>
                    </Text>
                    <TouchableOpacity onPress={() => { setEditingComment(null); setInputText(""); }}>
                      <Ionicons name="close" size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                ) : replyParentComment ? (
                  <View style={styles.replyBanner}>
                    <Text style={[styles.replyBannerText, { color: colors.textSecondary }]}>
                      {getDisplayName(replyParentComment.user, "익명")} 님에게 답글 작성 중
                    </Text>
                    <TouchableOpacity onPress={() => setReplyParentComment(null)}>
                      <Ionicons name="close" size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                ) : null}
                <View style={styles.inputRow}>
                  <TextInput
                    ref={commentInputRef}
                    style={[styles.input, { backgroundColor: colors.bgInput || "#27272a", color: colors.textPrimary }]}
                    placeholder={
                      editingComment
                        ? "댓글 내용 수정..."
                        : replyParentComment
                        ? `${getDisplayName(replyParentComment.user, "익명")} 님에게 답글 달기...`
                        : isAnonymous
                        ? "익명으로 댓글 작성..."
                        : "댓글 작성..."
                    }
                    placeholderTextColor={colors.textSecondary || "#71717a"}
                    value={inputText}
                    onChangeText={setInputText}
                    multiline
                  />
                  <TouchableOpacity
                    onPress={handleCreateComment}
                    disabled={!inputText.trim() || submittingComment}
                    style={{ paddingHorizontal: 12, paddingVertical: 8 }}
                  >
                    {submittingComment ? (
                      <ActivityIndicator size="small" color={colors.accentPurple || "#a855f7"} />
                    ) : (
                      <Text
                        style={[
                          styles.postCommentText,
                          { color: inputText.trim() ? colors.accentPurple || "#a855f7" : colors.textSecondary },
                        ]}
                      >
                        {editingComment ? "수정" : "게시"}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Edit Community Post Modal */}
      {post && (
        <CreateCommunityPostModal
          visible={editModalVisible}
          editPost={post}
          initialBoardType={post.board_type}
          onClose={() => setEditModalVisible(false)}
          onPostCreated={() => {
            fetchPostDetail(post.id);
            if (onPostUpdated) onPostUpdated();
          }}
        />
      )}

      {/* Image Detail Zoom Viewer Modal */}
      {post && post.media && post.media.length > 0 && (
        <ImageDetailViewerModal
          visible={viewerVisible}
          media={post.media}
          initialIndex={0}
          onClose={() => setViewerVisible(false)}
        />
      )}
    </>
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
  badgeContainer: {
    backgroundColor: "rgba(139, 92, 246, 0.2)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(139, 92, 246, 0.5)",
  },
  badgeText: {
    color: "#c084fc",
    fontSize: 13,
    fontWeight: "700",
  },
  loadingCenter: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 12,
  },
  anonAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: "center",
    alignItems: "center",
  },
  userAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  authorName: {
    fontSize: 15,
    fontWeight: "700",
  },
  timeText: {
    fontSize: 12,
    marginTop: 2,
  },
  postTitle: {
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 28,
    marginBottom: 10,
  },
  postBody: {
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 16,
  },
  mediaContainer: {
    width: "100%",
    height: 240,
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 16,
    position: "relative",
  },
  mediaImage: {
    width: "100%",
    height: "100%",
  },
  zoomHintBadge: {
    position: "absolute",
    bottom: 10,
    right: 10,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  zoomHintText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "600",
  },
  actionBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    gap: 24,
    marginBottom: 20,
  },
  actionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  actionCount: {
    fontSize: 14,
    fontWeight: "600",
  },
  commentsSectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
  },
  noCommentsText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    width: "100%",
    paddingHorizontal: 16,
    marginVertical: 20,
  },
  footerInputContainer: {
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  replyBanner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 8,
  },
  replyBannerText: {
    fontSize: 12,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  input: {
    flex: 1,
    minHeight: 38,
    maxHeight: 100,
    borderRadius: 19,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
  },
  postCommentText: {
    fontSize: 14,
    fontWeight: "700",
  },
});
