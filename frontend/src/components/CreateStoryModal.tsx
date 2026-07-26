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
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import api from "../services/api";
import { getFullImageUrl } from "../config";
import { useTheme } from "../context/ThemeContext";

const { width } = Dimensions.get("window");

interface CreateStoryModalProps {
  visible: boolean;
  onClose: () => void;
  onStoryCreated: () => void;
}

export const CreateStoryModal: React.FC<CreateStoryModalProps> = ({
  visible,
  onClose,
  onStoryCreated,
}) => {
  const { colors } = useTheme();
  const [selectedAsset, setSelectedAsset] = useState<any>(null);
  const [mediaUrl, setMediaUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [loading, setLoading] = useState(false);

  const handlePickImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("권한 필요", "사진을 선택하려면 갤러리 접근 권한이 필요합니다.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 1,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedAsset(result.assets[0]);
        setMediaUrl("");
      }
    } catch (e) {
      console.error("Error picking image", e);
      Alert.alert("오류", "이미지 선택 중 오류가 발생했습니다.");
    }
  };

  const handleClose = () => {
    setSelectedAsset(null);
    setMediaUrl("");
    setCaption("");
    onClose();
  };

  const handleSubmitStory = async () => {
    if (!selectedAsset && !mediaUrl) {
      Alert.alert("알림", "스토리에 올릴 사진을 선택해 주세요.");
      return;
    }

    setLoading(true);
    try {
      let finalUrl = mediaUrl;

      if (selectedAsset) {
        const formData = new FormData();
        const filename = selectedAsset.fileName || `story_${Date.now()}.jpg`;
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
          params: { purpose: "story" },
        });

        if (uploadRes.data && uploadRes.data.data) {
          finalUrl = uploadRes.data.data.url;
        }
      }

      await api.post("/stories", {
        media_url: finalUrl,
        media_type: "image",
        caption: caption.trim() || undefined,
      });

      setSelectedAsset(null);
      setMediaUrl("");
      setCaption("");
      onStoryCreated();
      onClose();
    } catch (err) {
      console.error("Error submitting story", err);
      Alert.alert("오류", "스토리 등록 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  const currentPreviewUri = selectedAsset
    ? selectedAsset.uri
    : mediaUrl
    ? getFullImageUrl(mediaUrl)
    : null;

  const canSubmit = Boolean(currentPreviewUri) && !loading;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={handleClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.borderColor }]}>
          <TouchableOpacity
            onPress={handleClose}
            disabled={loading}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>새 스토리</Text>
          <TouchableOpacity
            onPress={handleSubmitStory}
            disabled={!canSubmit}
            style={[
              styles.submitBtn,
              { backgroundColor: canSubmit ? colors.accentBlue : colors.borderColor },
            ]}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.submitBtnText}>공유</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Main Story Canvas / Image Preview */}
          <TouchableOpacity
            style={[styles.previewContainer, { backgroundColor: colors.bgInput, borderColor: colors.borderColor }]}
            onPress={handlePickImage}
            disabled={loading}
            activeOpacity={0.88}
          >
            {currentPreviewUri ? (
              <>
                <Image
                  source={{ uri: currentPreviewUri }}
                  style={styles.previewImage}
                  resizeMode="contain"
                />
                {/* Change image badge */}
                <View style={styles.changeBadge}>
                  <Ionicons name="image-outline" size={15} color="#fff" style={{ marginRight: 5 }} />
                  <Text style={styles.changeBadgeText}>사진 변경</Text>
                </View>
              </>
            ) : (
              <View style={styles.placeholderBox}>
                <View style={[styles.iconCircle, { backgroundColor: colors.accentBlue + "15" }]}>
                  <Ionicons name="images-outline" size={42} color={colors.accentBlue} />
                </View>
                <Text style={[styles.placeholderTitle, { color: colors.textPrimary }]}>스토리 사진 선택</Text>
                <Text style={[styles.placeholderSubtitle, { color: colors.textMuted }]}>
                  여기를 터치하여 갤러리에서 사진을 불러오세요
                </Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Caption Input area (without header text) */}
          <View style={styles.captionBlock}>
            <TextInput
              style={[
                styles.captionInput,
                {
                  backgroundColor: colors.bgInput,
                  color: colors.textPrimary,
                  borderColor: colors.borderColor,
                },
              ]}
              placeholder="스토리에 남길 문구를 작성해보세요..."
              placeholderTextColor={colors.textMuted}
              value={caption}
              onChangeText={setCaption}
              maxLength={200}
              multiline
              editable={!loading}
            />
            <Text style={[styles.charCount, { color: colors.textMuted }]}>{caption.length}/200</Text>
          </View>

          <View style={{ height: 30 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
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
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  submitBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  submitBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  previewContainer: {
    width: "100%",
    height: width * 1.15,
    borderRadius: 20,
    overflow: "hidden",
    marginTop: 16,
    marginBottom: 16,
    borderWidth: 1,
    position: "relative",
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  changeBadge: {
    position: "absolute",
    bottom: 14,
    right: 14,
    backgroundColor: "rgba(0,0,0,0.65)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  changeBadgeText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "600",
  },
  placeholderBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  placeholderTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 6,
  },
  placeholderSubtitle: {
    fontSize: 13,
    textAlign: "center",
  },
  captionBlock: {
    marginBottom: 16,
  },
  captionInput: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    fontSize: 14,
    minHeight: 84,
    textAlignVertical: "top",
    lineHeight: 20,
  },
  charCount: {
    fontSize: 11,
    textAlign: "right",
    marginTop: 6,
  },
});
