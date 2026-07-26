import React from "react";
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  Image,
  Dimensions,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { getFullImageUrl } from "../config";
import { useTheme } from "../context/ThemeContext";

const { width, height } = Dimensions.get("window");

interface StoryDetailModalProps {
  visible: boolean;
  story: any | null;
  onClose: () => void;
  onDeleteStory?: (storyId: string) => void;
}

export const StoryDetailModal: React.FC<StoryDetailModalProps> = ({
  visible,
  story,
  onClose,
  onDeleteStory,
}) => {
  const { colors } = useTheme();

  if (!visible || !story) return null;

  const imageUrl = getFullImageUrl(story.media_url);

  const handleDelete = () => {
    Alert.alert("스토리 삭제", "이 스토리를 정말로 삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: () => {
          if (onDeleteStory) onDeleteStory(story.id);
          onClose();
        },
      },
    ]);
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* 풀스크린 배경 이미지 */}
        <Image source={{ uri: imageUrl }} style={styles.backgroundImage} resizeMode="cover" />

        {/* 어두운 오버레이 */}
        <View style={styles.overlay} />

        <SafeAreaView style={styles.safeArea}>
          {/* 헤더: 아이디 + 닫기/삭제 버튼 */}
          <View style={styles.header}>
            <View style={styles.userInfo}>
              {story.user?.profile_image_url ? (
                <Image
                  source={{ uri: getFullImageUrl(story.user.profile_image_url) }}
                  style={styles.avatar}
                />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Text style={styles.avatarInitial}>
                    {story.user?.username ? story.user.username[0].toUpperCase() : "ME"}
                  </Text>
                </View>
              )}
              <Text style={styles.username}>{story.user?.username || "내 스토리"}</Text>
            </View>

            <View style={styles.headerActions}>
              {onDeleteStory && (
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={handleDelete}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="trash-outline" size={20} color="#fff" />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={onClose}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* 하단 캡션 — 사진 위 반투명 박스 */}
          {story.caption ? (
            <View style={styles.captionContainer}>
              <View style={styles.captionBox}>
                <Text style={styles.captionText}>{story.caption}</Text>
              </View>
            </View>
          ) : null}
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  backgroundImage: {
    position: "absolute",
    top: 0,
    left: 0,
    width,
    height,
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    width,
    height,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    paddingTop: Platform.OS === "android" ? 40 : 12,
    zIndex: 10,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#333",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.5)",
  },
  avatarPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#555",
  },
  avatarInitial: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 15,
  },
  username: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  iconBtn: {
    padding: 8,
  },
  captionContainer: {
    position: "absolute",
    bottom: 48,
    left: 16,
    right: 16,
    zIndex: 10,
  },
  captionBox: {
    backgroundColor: "rgba(0,0,0,0.52)",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  captionText: {
    color: "#fff",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "500",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
