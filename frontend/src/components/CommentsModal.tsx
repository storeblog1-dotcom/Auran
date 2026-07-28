import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  FlatList,
  TextInput,
  Image,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { getDisplayName } from "../utils/displayName";
import { HashtagText } from "./HashtagText";

export interface Comment {
  id: string;
  post_id: string;
  parent_id?: string | null;
  user: {
    id: string;
    username: string;
    full_name: string;
    profile_image_url?: string;
  };
  content: string;
  created_at: string;
  updated_at: string;
  replies?: Comment[];
}

interface CommentsModalProps {
  visible: boolean;
  postId: string | null;
  onClose: () => void;
  onCommentAdded?: () => void;
  onCommentDeleted?: () => void;
}

interface CommentNodeProps {
  comment: Comment;
  depth?: number;
  currentUser: any;
  colors: any;
  onPressReply: (comment: Comment) => void;
  onDeleteComment: (commentId: string) => void;
  onEditComment?: (comment: Comment) => void;
}

export const CommentNode: React.FC<CommentNodeProps> = ({
  comment,
  depth = 0,
  currentUser,
  colors,
  onPressReply,
  onDeleteComment,
  onEditComment,
}) => {
  const isMyComment = (comment as any).is_mine || (currentUser && currentUser.id === comment.user.id);

  return (
    <View style={styles.commentContainer}>
      <View style={styles.commentItem}>
        <Image
          source={{
            uri:
              comment.user.profile_image_url ||
              "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150",
          }}
          style={depth > 0 ? styles.replyAvatar : styles.avatar}
        />
        <View style={styles.commentContentContainer}>
          {/* Author and timestamp stay separate from comment actions on narrow screens. */}
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginBottom: 3 }}>
            <View style={{ flexDirection: "row", alignItems: "center", flexShrink: 1 }}>
              {depth > 0 && (
                <Text style={{ color: colors.accentBlue, fontWeight: "bold", fontSize: 13, marginRight: 4 }}>
                  ↳
                </Text>
              )}
              <Text style={[styles.username, { color: colors.textPrimary, marginRight: 8 }]}>
                {getDisplayName(comment.user)}
              </Text>
              <Text style={[styles.timeText, { color: colors.textMuted }]}>
                {new Date(comment.created_at).toLocaleDateString("ko-KR", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
            </View>
          </View>

          {/* Row 2: Comment Content on the Next Line */}
          <View style={{ marginTop: 2, marginBottom: 2 }}>
            <HashtagText text={comment.content} style={{ fontSize: 14, lineHeight: 20, color: colors.textPrimary }} />
          </View>
          <View style={styles.commentActionsRow}>
            <TouchableOpacity style={styles.replyBtn} onPress={() => onPressReply(comment)}>
              <Text style={[styles.replyBtnText, { color: colors.accentBlue }]}>답글 달기</Text>
            </TouchableOpacity>
            {isMyComment && onEditComment && (
              <TouchableOpacity style={styles.commentActionButton} onPress={() => onEditComment(comment)}>
                <Ionicons name="create-outline" size={16} color={colors.accentPurple || "#a855f7"} />
              </TouchableOpacity>
            )}
            {isMyComment && (
              <TouchableOpacity style={styles.commentActionButton} onPress={() => onDeleteComment(comment.id)}>
                <Ionicons name="trash-outline" size={16} color="#ef4444" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* Render nested replies recursively matching exact 2-tier indent diagram */}
      {comment.replies && comment.replies.length > 0 && (
        <View
          style={{
            marginLeft: depth < 2 ? 18 : 0,
            borderLeftWidth: 1.5,
            borderLeftColor: colors.borderColor,
            paddingLeft: 8,
            marginTop: 6,
          }}
        >
          {comment.replies.map((reply) => (
            <CommentNode
              key={reply.id}
              comment={reply}
              depth={depth + 1}
              currentUser={currentUser}
              colors={colors}
              onPressReply={onPressReply}
              onDeleteComment={onDeleteComment}
              onEditComment={onEditComment}
            />
          ))}
        </View>
      )}
    </View>
  );
};

export const CommentsModal: React.FC<CommentsModalProps> = ({
  visible,
  postId,
  onClose,
  onCommentAdded,
  onCommentDeleted,
}) => {
  const { user: currentUser } = useAuth();
  const { colors } = useTheme();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [inputText, setInputText] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [replyParentComment, setReplyParentComment] = useState<Comment | null>(null);
  const [editingComment, setEditingComment] = useState<Comment | null>(null);

  const fetchComments = async () => {
    if (!postId) return;
    setLoading(true);
    try {
      const response = await api.get(`/posts/${postId}/comments`);
      if (response.data && response.data.data) {
        setComments(response.data.data);
      }
    } catch (err) {
      console.log("Error fetching comments", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible && postId) {
      setReplyParentComment(null);
      setEditingComment(null);
      setInputText("");
      fetchComments();
    }
  }, [visible, postId]);

  const handlePressReply = (comment: Comment) => {
    setEditingComment(null);
    setReplyParentComment(comment);
    setInputText("");
  };

  const handleCancelReply = () => {
    setReplyParentComment(null);
    setInputText("");
  };

  const handleEditComment = (comment: Comment) => {
    setReplyParentComment(null);
    setEditingComment(comment);
    setInputText(comment.content);
  };

  const handleCancelEdit = () => {
    setEditingComment(null);
    setInputText("");
  };

  const handleAddComment = async () => {
    if (!inputText.trim() || !postId) return;
    setSubmitting(true);
    try {
      if (editingComment) {
        const response = await api.patch(`/posts/comments/${editingComment.id}`, {
          content: inputText.trim(),
        });
        if (response.data) {
          setInputText("");
          setEditingComment(null);
          fetchComments();
        }
      } else {
        const response = await api.post(`/posts/${postId}/comments`, {
          content: inputText.trim(),
          parent_id: replyParentComment ? replyParentComment.id : null,
          mention_user_id: replyParentComment?.user.id,
        });
        if (response.data) {
          setInputText("");
          setReplyParentComment(null);
          fetchComments();
          if (onCommentAdded) onCommentAdded();
        }
      }
    } catch (err) {
      console.log("Error adding/editing comment", err);
      Alert.alert("오류", editingComment ? "댓글 수정에 실패했습니다." : "댓글 작성에 실패했습니다.");
    } finally {
      setSubmitting(false);
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
            fetchComments();
            if (onCommentDeleted) onCommentDeleted();
          } catch (err) {
            console.log("Failed to delete comment", err);
            Alert.alert("오류", "댓글 삭제에 실패했습니다.");
          }
        },
      },
    ]);
  };

  const renderCommentItem = ({ item }: { item: Comment }) => {
    return (
      <CommentNode
        comment={item}
        depth={0}
        currentUser={currentUser}
        colors={colors}
        onPressReply={handlePressReply}
        onDeleteComment={handleDeleteComment}
        onEditComment={handleEditComment}
      />
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.dismissArea} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={[styles.modalContainer, { backgroundColor: colors.modalBg }]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.borderColor }]}>
            <View style={[styles.dragHandle, { backgroundColor: colors.borderColor }]} />
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>댓글</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Comment List */}
          {loading ? (
            <View style={styles.centerLoading}>
              <ActivityIndicator size="large" color={colors.accentBlue} />
            </View>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(item) => item.id}
              renderItem={renderCommentItem}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={[styles.emptyText, { color: colors.textPrimary }]}>아직 댓글이 없습니다.</Text>
                  <Text style={[styles.emptySubText, { color: colors.textSecondary }]}>첫 댓글을 작성해보세요!</Text>
                </View>
              }
            />
          )}

          {/* Target Reply Bar if replyParentComment is set */}
          {replyParentComment && (
            <View style={[styles.replyingBar, { backgroundColor: colors.bgInput, borderTopColor: colors.borderColor }]}>
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
            <View style={[styles.replyingBar, { backgroundColor: colors.bgInput, borderTopColor: colors.borderColor }]}>
              <Text style={[styles.replyingText, { color: colors.textSecondary }]}>
                ✏️ <Text style={{ fontWeight: "bold", color: colors.accentPurple || "#a855f7" }}>댓글 수정 중</Text>
              </Text>
              <TouchableOpacity onPress={handleCancelEdit} style={styles.cancelReplyBtn}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          )}

          {/* Input Bar */}
          <View style={[styles.inputContainer, { backgroundColor: colors.bgPrimary, borderTopColor: colors.borderColor }]}>
            <Image
              source={{
                uri:
                  currentUser?.profile_image_url ||
                  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150",
              }}
              style={styles.inputAvatar}
            />
            <TextInput
              style={[styles.textInput, { color: colors.textPrimary }]}
              placeholder={
                editingComment
                  ? "댓글 내용 수정..."
                  : replyParentComment
                  ? `${getDisplayName(replyParentComment.user)} 님에게 답글 달기...`
                  : `${getDisplayName(currentUser)} (으)로 댓글 달기...`
              }
              placeholderTextColor={colors.textSecondary}
              value={inputText}
              onChangeText={setInputText}
              multiline
            />
            <TouchableOpacity
              onPress={handleAddComment}
              disabled={!inputText.trim() || submitting}
              style={styles.postBtn}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#0095f6" />
              ) : (
                <Text
                  style={[
                    styles.postBtnText,
                    !inputText.trim() && styles.postBtnDisabled,
                  ]}
                >
                  {editingComment ? "수정" : "게시"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  dismissArea: {
    flex: 1,
  },
  modalContainer: {
    height: "75%",
    backgroundColor: "#121212",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  header: {
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 0.5,
    borderBottomColor: "#262626",
    position: "relative",
  },
  dragHandle: {
    width: 36,
    height: 4,
    backgroundColor: "#444",
    borderRadius: 2,
    position: "absolute",
    top: 6,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    marginTop: 8,
  },
  closeBtn: {
    position: "absolute",
    right: 16,
    top: 12,
    padding: 4,
  },
  closeBtnText: {
    color: "#8e8e8e",
    fontSize: 18,
    fontWeight: "bold",
  },
  centerLoading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    padding: 16,
  },
  commentContainer: {
    marginBottom: 16,
  },
  commentItem: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 12,
  },
  commentContentContainer: {
    flex: 1,
  },
  commentText: {
    color: "#fff",
    fontSize: 14,
    lineHeight: 18,
  },
  username: {
    fontWeight: "bold",
  },
  commentMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 12,
  },
  replyBtn: {
    minHeight: 32,
    paddingHorizontal: 6,
    justifyContent: "center",
  },
  replyBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
  repliesListContainer: {
    marginLeft: 32,
    marginTop: 10,
    paddingLeft: 12,
    borderLeftWidth: 1.5,
  },
  replyItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  replyAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    marginRight: 10,
  },
  timeText: {
    color: "#8e8e8e",
    fontSize: 11,
  },
  commentActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
  },
  commentActionButton: {
    minWidth: 32,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteBtnText: {
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    paddingHorizontal: 16,
    width: "100%",
    lineHeight: 22,
  },
  emptySubText: {
    color: "#8e8e8e",
    fontSize: 13,
    marginTop: 6,
    textAlign: "center",
    paddingHorizontal: 16,
    width: "100%",
    lineHeight: 18,
  },
  replyingBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 0.5,
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 0.5,
    borderTopColor: "#262626",
    backgroundColor: "#121212",
  },
  inputAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    maxHeight: 100,
    paddingVertical: 4,
  },
  postBtn: {
    marginLeft: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  postBtnText: {
    color: "#0095f6",
    fontWeight: "bold",
    fontSize: 15,
  },
  postBtnDisabled: {
    color: "#00376b",
  },
});
