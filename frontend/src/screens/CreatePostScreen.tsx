import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
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
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import api from "../services/api";
import { useTheme } from "../context/ThemeContext";

const { width } = Dimensions.get("window");

interface MediaPickItem {
  id: string;
  uri: string;
  asset?: any;
}

type PostVisibility = "public" | "followers" | "private";

const VISIBILITY_OPTIONS: Array<{
  value: PostVisibility;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
}> = [
  { value: "public", label: "전체 공개", icon: "earth-outline" },
  { value: "followers", label: "팔로워 공개", icon: "people-outline" },
  { value: "private", label: "비공개", icon: "lock-closed-outline" },
];

export const CreatePostScreen = ({ route, navigation }: any) => {
  const { colors } = useTheme();

  const editPost = route?.params?.editPost;
  const isEditMode = !!editPost;

  // 선택된 미디어 목록 (최대 10장 내부 제한)
  const [selectedMedia, setSelectedMedia] = useState<MediaPickItem[]>([]);
  
  // 문구, 해시태그 및 위치 정보
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [locationName, setLocationName] = useState("");
  const [visibility, setVisibility] = useState<PostVisibility>("public");
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 캡션 및 해시태그 파싱
  const parsePostCaptionAndHashtags = (rawCaption?: string | null) => {
    if (!rawCaption) return { captionText: "", hashtagsText: "" };
    if (rawCaption.includes("\n\n")) {
      const lastIndex = rawCaption.lastIndexOf("\n\n");
      const mainText = rawCaption.substring(0, lastIndex).trim();
      const tagsText = rawCaption.substring(lastIndex + 2).trim();

      if (tagsText.split(/[\s,]+/).every((w) => w.startsWith("#"))) {
        return { captionText: mainText, hashtagsText: tagsText };
      }
    }
    if (
      rawCaption.trim().startsWith("#") &&
      rawCaption.split(/[\s,]+/).every((w) => w.startsWith("#"))
    ) {
      return { captionText: "", hashtagsText: rawCaption.trim() };
    }
    return { captionText: rawCaption, hashtagsText: "" };
  };

  // 해시태그 입력값 정규화 (각 단어 앞에 '#' 붙이고 ','로 구분)
  const formatHashtags = (input: string): string => {
    if (!input || !input.trim()) return "";
    const words = input
      .split(/[\s,]+/)
      .map((w) => w.replace(/^#+/, "").trim())
      .filter((w) => w.length > 0);
    if (words.length === 0) return "";
    return words.map((w) => `#${w}`).join(", ");
  };

  // 화면 진입/수정대상 변경 시 초기화
  useEffect(() => {
    if (editPost) {
      const { captionText, hashtagsText } = parsePostCaptionAndHashtags(editPost.caption);
      setCaption(captionText);
      setHashtags(hashtagsText);
      setLocationName(editPost.location || "");
      setVisibility(editPost.visibility || "public");

      if (editPost.media && Array.isArray(editPost.media)) {
        const loaded: MediaPickItem[] = editPost.media.map((m: any, idx: number) => ({
          id: m.id ? String(m.id) : `edit-m-${idx}`,
          uri: m.media_url,
        }));
        setSelectedMedia(loaded);
      }
    } else {
      setSelectedMedia([]);
      setCaption("");
      setHashtags("");
      setLocationName("");
      setVisibility("public");
      fetchCurrentGPSLocation();
    }
  }, [editPost]);

  const fetchCurrentGPSLocation = async () => {
    setLoadingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const currentLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        const [address] = await Location.reverseGeocodeAsync({
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude,
        });

        if (address) {
          const city = address.city || address.region || address.district || "";
          const country = address.country || "대한민국";
          const formattedLocation = city ? `${city}, ${country}` : country;
          setLocationName(formattedLocation);
        } else {
          setLocationName("서울, 대한민국");
        }
      } else {
        setLocationName("서울, 대한민국");
      }
    } catch (e) {
      console.log("GPS Location sensing error:", e);
      setLocationName("서울, 대한민국");
    } finally {
      setLoadingLocation(false);
    }
  };

  // 2. 스마트폰 갤러리에서 사진 선택 (최대 10장 내부 제한)
  const handlePickFromDeviceGallery = async () => {
    if (selectedMedia.length >= 10) {
      return;
    }

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("권한 필요", "사진을 선택하려면 갤러리 접근 권한이 필요합니다.");
        return;
      }

      const limit = Math.max(1, 10 - selectedMedia.length);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: limit,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const timestampBase = Date.now();
        const newPicked: MediaPickItem[] = result.assets.map((asset, idx) => ({
          id: `picked-${timestampBase}-${idx}`,
          uri: asset.uri,
          asset,
        }));

        setSelectedMedia((prev) => [...prev, ...newPicked].slice(0, 10));
      }
    } catch (e) {
      console.log("Error picking images:", e);
    }
  };

  // 3. 카메라 직접 촬영
  const handleCameraLaunch = async () => {
    if (selectedMedia.length >= 10) {
      return;
    }

    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        handlePickFromDeviceGallery();
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.85 });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const captured: MediaPickItem = {
          id: `cam-${Date.now()}`,
          uri: result.assets[0].uri,
          asset: result.assets[0],
        };
        setSelectedMedia((prev) => [captured, ...prev].slice(0, 10));
      }
    } catch (e) {
      console.log("Camera launch error:", e);
    }
  };

  // 개별 사진 삭제 핸들러
  const handleRemoveMedia = (index: number) => {
    setSelectedMedia((prev) => prev.filter((_, i) => i !== index));
  };

  // 4. 피드에 게시물 업로드 / 수정
  const handleCreatePost = async () => {
    if (selectedMedia.length === 0) {
      Alert.alert("알림", "사진을 1장 이상 선택해주세요.");
      return;
    }

    setSubmitting(true);
    try {
      const formattedHashtags = formatHashtags(hashtags);
      const finalCaption = formattedHashtags
        ? caption.trim()
          ? `${caption.trim()}\n\n${formattedHashtags}`
          : formattedHashtags
        : caption.trim();

      if (isEditMode) {
        await api.patch(`/posts/${editPost.id}`, {
          caption: finalCaption,
          location: locationName || null,
          visibility,
        });

        Alert.alert("성공", "게시물이 수정되었습니다.");
        if (route.params?.onPostUpdated) {
          route.params.onPostUpdated();
        }
        if (navigation.canGoBack()) {
          navigation.goBack();
        } else {
          navigation.navigate("Feed");
        }
      } else {
        const uploadedMediaList = [];

        for (let i = 0; i < selectedMedia.length; i++) {
          const item = selectedMedia[i];
          if (item.uri.startsWith("http://") || item.uri.startsWith("https://")) {
            uploadedMediaList.push({
              media_url: item.uri,
              media_type: "image",
              order: i,
            });
          } else {
            const formData = new FormData();
            const filename = `post_${Date.now()}_${i}.jpg`;
            formData.append("file", { uri: item.uri, name: filename, type: "image/jpeg" } as any);

            const uploadRes = await api.post("/uploads/image", formData, {
              headers: { "Content-Type": "multipart/form-data" },
            });

            if (uploadRes.data?.data?.url) {
              uploadedMediaList.push({
                media_url: uploadRes.data.data.url,
                media_type: "image",
                order: i,
              });
            }
          }
        }

        await api.post("/posts", {
          caption: finalCaption,
          location: locationName || null,
          visibility,
          media: uploadedMediaList,
        });

        setSelectedMedia([]);
        setCaption("");
        setHashtags("");
        setLocationName("");
        navigation.navigate("Feed");
        Alert.alert("성공", "새 피드가 성공적으로 공유되었습니다!");
      }
    } catch (err) {
      console.error("Create/update post error:", err);
      Alert.alert("오류", isEditMode ? "게시물 수정에 실패했습니다." : "게시물 공유에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.borderColor }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerIconBtn}>
          <Ionicons name="close" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          {isEditMode ? "게시물 수정" : "새 피드 작성"}
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* ── 1. 사진 추가 및 선택 ── */}
        {selectedMedia.length > 0 ? (
          <View style={styles.previewSection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                선택된 사진
              </Text>

              <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
                {/* 갤러리 사진 선택/수정 아이콘 */}
                <TouchableOpacity onPress={handlePickFromDeviceGallery} style={styles.actionIconBtn}>
                  <Ionicons name="images-outline" size={22} color={colors.accentBlue} />
                </TouchableOpacity>

                {/* 카메라 직접 촬영 아이콘 */}
                <TouchableOpacity onPress={handleCameraLaunch} style={styles.actionIconBtn}>
                  <Ionicons name="camera-outline" size={22} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.previewScroll}>
              {selectedMedia.map((item, idx) => (
                <View key={item.id} style={styles.previewCard}>
                  <Image source={{ uri: item.uri }} style={styles.previewImage} />
                  
                  {/* 순서 뱃지 */}
                  <View style={styles.orderBadge}>
                    <Text style={styles.orderBadgeText}>{idx + 1}</Text>
                  </View>

                  {/* 삭제 버튼 */}
                  <TouchableOpacity
                    style={styles.removeBadge}
                    onPress={() => handleRemoveMedia(idx)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="close" size={14} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        ) : (
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
            <TouchableOpacity
              style={[styles.emptyBox, { flex: 1, backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}
              onPress={handlePickFromDeviceGallery}
              activeOpacity={0.85}
            >
              <Ionicons name="images-outline" size={40} color={colors.accentBlue} />
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                갤러리에서 사진 선택
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.emptyBox, { width: 100, backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}
              onPress={handleCameraLaunch}
              activeOpacity={0.85}
            >
              <Ionicons name="camera-outline" size={40} color={colors.textPrimary} />
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                카메라
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── 2. 캡션 입력 박스 ── */}
        <View style={styles.inputSection}>
          <TextInput
            style={[
              styles.captionInput,
              { backgroundColor: colors.bgInput, borderColor: colors.borderColor, color: colors.textPrimary },
            ]}
            placeholder="캡션추가"
            placeholderTextColor={colors.textSecondary}
            multiline
            numberOfLines={5}
            value={caption}
            onChangeText={setCaption}
          />
        </View>

        {/* ── 3. 별도 한 줄짜리 해시태그 입력 박스 ── */}
        <View style={styles.inputSection}>
          <View style={[styles.hashtagBox, { backgroundColor: colors.bgInput, borderColor: colors.borderColor }]}>
            <Ionicons name="pricetag-outline" size={18} color={colors.accentBlue} style={{ marginRight: 8 }} />
            <TextInput
              style={[styles.hashtagInput, { color: colors.textPrimary }]}
              placeholder="해시태그 입력 (예: 일상 여행 데일리)"
              placeholderTextColor={colors.textSecondary}
              numberOfLines={1}
              value={hashtags}
              onChangeText={setHashtags}
              onBlur={() => setHashtags(formatHashtags(hashtags))}
            />
          </View>
        </View>

        {/* ── 4. GPS 감지 현재 위치 ── */}
        <View style={styles.inputSection}>
          <View style={styles.locationHeaderRow}>
            <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>현재 위치</Text>
            <TouchableOpacity onPress={fetchCurrentGPSLocation} style={styles.refreshLocBtn}>
              <Ionicons name="refresh-outline" size={14} color={colors.accentBlue} style={{ marginRight: 4 }} />
              <Text style={[styles.refreshLocText, { color: colors.accentBlue }]}>위치 재감지</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.locationBox, { backgroundColor: colors.bgInput, borderColor: colors.borderColor }]}>
            <Ionicons name="location" size={20} color={colors.accentBlue} style={{ marginRight: 10 }} />
            {loadingLocation ? (
              <ActivityIndicator size="small" color={colors.accentBlue} />
            ) : (
              <TextInput
                style={[styles.locationInput, { color: colors.textPrimary }]}
                value={locationName}
                onChangeText={setLocationName}
                placeholder="GPS 위치 감지 중..."
                placeholderTextColor={colors.textSecondary}
              />
            )}
          </View>
        </View>

        <View style={styles.inputSection}>
          <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>공개 범위</Text>
          <View style={styles.visibilityRow}>
            {VISIBILITY_OPTIONS.map((option) => {
              const selected = visibility === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.visibilityOption,
                    {
                      backgroundColor: selected ? colors.accentBlue : colors.bgInput,
                      borderColor: selected ? colors.accentBlue : colors.borderColor,
                    },
                  ]}
                  onPress={() => setVisibility(option.value)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={option.icon}
                    size={18}
                    color={selected ? "#fff" : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.visibilityText,
                      { color: selected ? "#fff" : colors.textPrimary },
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── 6. 맨 아래 대형 버튼 ── */}
        <TouchableOpacity
          style={[
            styles.shareBtn,
            { backgroundColor: colors.accentBlue, opacity: selectedMedia.length === 0 || submitting ? 0.6 : 1 },
          ]}
          onPress={handleCreatePost}
          disabled={selectedMedia.length === 0 || submitting}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons
                name={isEditMode ? "checkmark-circle-outline" : "paper-plane"}
                size={20}
                color="#fff"
                style={{ marginRight: 8 }}
              />
              <Text style={styles.shareBtnText}>
                {isEditMode ? "수정 완료" : "피드에 공유하기"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "bold",
  },
  headerIconBtn: {
    padding: 4,
  },
  scrollContent: {
    padding: 16,
  },

  /* 미리보기 영역 */
  previewSection: {
    marginBottom: 20,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "bold",
  },
  actionIconBtn: {
    flexDirection: "row",
    alignItems: "center",
  },
  previewScroll: {
    flexDirection: "row",
  },
  previewCard: {
    width: 110,
    height: 140,
    borderRadius: 10,
    marginRight: 10,
    overflow: "hidden",
    position: "relative",
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  orderBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: "rgba(0,0,0,0.65)",
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
  },
  orderBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "bold",
  },
  removeBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "rgba(239, 68, 68, 0.9)",
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyBox: {
    height: 140,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "bold",
    marginTop: 8,
  },

  /* 문구 및 GPS 위치 작성 */
  inputSection: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 8,
  },
  captionInput: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    fontSize: 15,
    minHeight: 110,
    textAlignVertical: "top",
  },
  hashtagBox: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
  },
  hashtagInput: {
    flex: 1,
    fontSize: 14,
  },
  locationHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  refreshLocBtn: {
    flexDirection: "row",
    alignItems: "center",
  },
  refreshLocText: {
    fontSize: 12,
    fontWeight: "bold",
  },
  locationBox: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
  },
  locationInput: {
    flex: 1,
    fontSize: 14,
  },
  visibilityRow: {
    flexDirection: "row",
    gap: 8,
  },
  visibilityOption: {
    flex: 1,
    minHeight: 64,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 4,
  },
  visibilityText: {
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },

  /* 맨 아래 공유하기 버튼 */
  shareBtn: {
    height: 52,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    marginBottom: 30,
  },
  shareBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
});
