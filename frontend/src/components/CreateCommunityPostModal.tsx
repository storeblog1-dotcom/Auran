import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TextInput,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import api from "../services/api";
import { useTheme } from "../context/ThemeContext";

interface CreateCommunityPostModalProps {
  visible: boolean;
  initialBoardType?: "anonymous" | "info";
  boardId?: string | null;
  boardName?: string;
  boardOptions?: any[];
  editPost?: any;
  onClose: () => void;
  onPostCreated: () => void;
}

export const CreateCommunityPostModal: React.FC<CreateCommunityPostModalProps> = ({
  visible,
  initialBoardType = "anonymous",
  boardId,
  boardName,
  boardOptions = [],
  editPost,
  onClose,
  onPostCreated,
}) => {
  const { colors } = useTheme();
  const [boardType, setBoardType] = useState<"anonymous" | "info">(initialBoardType);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(boardId || null);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (visible) {
      if (editPost) {
        setBoardType(editPost.board_type || initialBoardType);
        setSelectedBoardId(editPost.board_id || boardId || null);
        setTitle(editPost.title || "");
        setCaption(editPost.caption || "");
        if (editPost.media && editPost.media.length > 0) {
          setSelectedAsset({
            uri: editPost.media[0].media_url,
            detailMediaUrl:
              editPost.media[0].detail_media_url || editPost.media[0].media_url,
          });
        } else {
          setSelectedAsset(null);
        }
      } else {
        setBoardType(initialBoardType);
        setSelectedBoardId(boardId || null);
        setTitle("");
        setCaption("");
        setSelectedAsset(null);
      }
    }
  }, [visible, initialBoardType, boardId, editPost]);

  const selectedBoard = boardOptions.find((board) => board.id === selectedBoardId);
  const selectedBoardLabel = selectedBoard?.name || boardName || "게시판";
  const selectBoard = (nextBoard: any) => {
    setSelectedBoardId(nextBoard.id);
    setBoardType(nextBoard.is_anonymous ? "anonymous" : "info");
  };

  const handlePickImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("권한 필요", "사진을 선택하려면 갤러리 접근 권한이 필요합니다.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.85,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedAsset(result.assets[0]);
      }
    } catch (e) {
      console.error("Error picking image", e);
      Alert.alert("오류", "이미지 선택 중 오류가 발생했습니다.");
    }
  };

  const handleReset = () => {
    setTitle("");
    setCaption("");
    setSelectedAsset(null);
    setLoading(false);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert("알림", "게시글 제목을 입력해 주세요.");
      return;
    }
    if (!caption.trim()) {
      Alert.alert("알림", "게시글 내용을 입력해 주세요.");
      return;
    }

    setLoading(true);
    try {
      const mediaList = [];
      if (selectedAsset && selectedAsset.uri && !selectedAsset.uri.startsWith("http")) {
        const formData = new FormData();
        const filename = selectedAsset.fileName || `comm_${Date.now()}.jpg`;
        const match = /\.(\w+)$/.exec(filename);
        const type = selectedAsset.mimeType || (match ? `image/${match[1]}` : "image/jpeg");

        // @ts-ignore
        formData.append("file", {
          uri: selectedAsset.uri,
          name: filename,
          type,
        });

        const uploadRes = await api.post("/uploads/image", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });

        if (uploadRes.data && uploadRes.data.data) {
          mediaList.push({
            media_url: uploadRes.data.data.url,
            detail_media_url:
              uploadRes.data.data.detail_url || uploadRes.data.data.url,
            media_type: "image",
            order: 0,
          });
        }
      } else if (selectedAsset && selectedAsset.uri) {
        mediaList.push({
          media_url: selectedAsset.uri,
          detail_media_url:
            selectedAsset.detailMediaUrl || selectedAsset.uri,
          media_type: "image",
          order: 0,
        });
      }

      if (editPost) {
        await api.patch(`/posts/${editPost.id}`, {
          title: title.trim(),
          board_type: boardType,
          board_id: selectedBoardId,
          caption: caption.trim(),
          media: mediaList,
        });
        Alert.alert("성공", "게시물이 수정되었습니다!");
      } else {
        await api.post("/posts", {
          title: title.trim(),
          caption: caption.trim(),
          board_type: boardType,
          board_id: selectedBoardId,
          media: mediaList,
        });

        Alert.alert("성공", "게시물이 등록되었습니다!");
      }

      handleClose();
      onPostCreated();
    } catch (err) {
      console.error("Error creating/editing community post", err);
      Alert.alert("오류", editPost ? "게시물 수정에 실패했습니다." : "게시물 등록에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={handleClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary || "#09090b" }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.borderColor || "#27272a" }]}>
            <TouchableOpacity onPress={handleClose} style={{ padding: 6 }}>
              <Ionicons name="close" size={26} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>커뮤니티 글쓰기</Text>
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={loading}
              style={[styles.submitButton, { opacity: loading ? 0.6 : 1 }]}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <LinearGradient
                  colors={[colors.accentPurple, colors.accentPink]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.gradientButton}
                >
                  <Text style={styles.submitText}>등록</Text>
                </LinearGradient>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>게시판</Text>
            <View style={[styles.selectedBoard, { backgroundColor: colors.bgCard || "#18181b" }]}>
              <Text style={{ color: colors.textPrimary, fontWeight: "700" }}>{selectedBoardLabel}</Text>
            </View>
            {boardOptions.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.boardOptions}>
                {boardOptions.map((board) => (
                  <TouchableOpacity
                    key={board.id}
                    onPress={() => selectBoard(board)}
                    style={[styles.boardOption, { borderColor: selectedBoardId === board.id ? colors.accentPurple : colors.borderColor, backgroundColor: selectedBoardId === board.id ? `${colors.accentPurple}18` : "transparent" }]}
                  >
                    <Text style={{ color: selectedBoardId === board.id ? colors.accentPurple : colors.textSecondary, fontWeight: "700" }}>{board.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Title Input */}
            <View style={styles.inputGroup}>
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>제목</Text>
              <TextInput
                style={[
                  styles.titleInput,
                  {
                    backgroundColor: colors.bgInput || "#18181b",
                    color: colors.textPrimary,
                    borderColor: colors.borderColor || "#27272a",
                  },
                ]}
                placeholder="제목을 입력하세요"
                placeholderTextColor={colors.textSecondary || "#71717a"}
                value={title}
                onChangeText={setTitle}
                maxLength={100}
              />
            </View>

            {/* Content Input */}
            <View style={styles.inputGroup}>
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>내용</Text>
              <TextInput
                style={[
                  styles.contentInput,
                  {
                    backgroundColor: colors.bgInput || "#18181b",
                    color: colors.textPrimary,
                    borderColor: colors.borderColor || "#27272a",
                  },
                ]}
                placeholder="내용을 작성하세요 (익명 게시판 작성 시 본인 정보가 공개되지 않습니다)"
                placeholderTextColor={colors.textSecondary || "#71717a"}
                value={caption}
                onChangeText={setCaption}
                multiline
                textAlignVertical="top"
              />
            </View>

            {/* Image Attachment */}
            <View style={styles.inputGroup}>
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>사진 첨부 (선택)</Text>
              {selectedAsset ? (
                <View style={styles.imagePreviewContainer}>
                  <Image source={{ uri: selectedAsset.uri }} style={styles.imagePreview} />
                  <TouchableOpacity
                    style={styles.removeImageBtn}
                    onPress={() => setSelectedAsset(null)}
                  >
                    <Ionicons name="close-circle" size={26} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.imagePickerBtn,
                    {
                      backgroundColor: colors.bgInput || "#18181b",
                      borderColor: colors.borderColor || "#27272a",
                    },
                  ]}
                  onPress={handlePickImage}
                >
                  <Ionicons name="image-outline" size={28} color={colors.accentPurple || "#a855f7"} />
                  <Text style={[styles.imagePickerText, { color: colors.textSecondary }]}>
                    사진 추가하기
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  submitButton: {
    borderRadius: 20,
    overflow: "hidden",
  },
  gradientButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  submitText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  scrollContent: {
    padding: 16,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
  },
  segmentedContainer: {
    flexDirection: "row",
    borderRadius: 25,
    padding: 4,
    marginBottom: 20,
  },
  selectedBoard: {
    minHeight: 46,
    borderRadius: 12,
    paddingHorizontal: 14,
    justifyContent: "center",
    marginBottom: 10,
  },
  boardOptions: { gap: 8, paddingBottom: 20 },
  boardOption: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 13, minHeight: 36, justifyContent: "center" },
  segmentedTab: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    overflow: "hidden",
  },
  segmentedTabGradient: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
  },
  segmentedTabInactive: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
  },
  segmentedTextActive: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },
  segmentedTextInactive: {
    fontWeight: "600",
    fontSize: 14,
  },
  inputGroup: {
    marginBottom: 20,
  },
  titleInput: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
  },
  contentInput: {
    minHeight: 140,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    lineHeight: 22,
  },
  imagePickerBtn: {
    height: 100,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  imagePickerText: {
    fontSize: 13,
    fontWeight: "500",
  },
  imagePreviewContainer: {
    position: "relative",
    width: "100%",
    height: 200,
    borderRadius: 12,
    overflow: "hidden",
  },
  imagePreview: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  removeImageBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 15,
  },
});
