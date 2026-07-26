import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import api from "../services/api";
import { getFullImageUrl } from "../config";

export const EditProfileScreen = ({ navigation }: any) => {
  const { user, refreshProfile } = useAuth();

  const [fullName, setFullName] = useState(user?.full_name || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [selectedAsset, setSelectedAsset] = useState<any>(null);
  const [profileImageUrl, setProfileImageUrl] = useState(user?.profile_image_url || "");
  const [isPrivate, setIsPrivate] = useState(user?.is_private || false);
  const [allowMessageRequests, setAllowMessageRequests] = useState(
    user?.allow_message_requests !== false
  );
  const [saving, setSaving] = useState(false);

  // Password section
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (user) {
      setFullName(user.full_name || "");
      setBio(user.bio || "");
      setProfileImageUrl(user.profile_image_url || "");
      setIsPrivate(user.is_private || false);
      setAllowMessageRequests(user.allow_message_requests !== false);
    }
  }, [user]);

  const handleTogglePrivacy = async (value: boolean) => {
    setIsPrivate(value);
    try {
      await api.patch("/users/me/privacy", { is_private: value });
      await refreshProfile();
    } catch (error) {
      console.error("Failed to toggle privacy", error);
      setIsPrivate(!value);
    }
  };

  const handleToggleMessageRequests = async (value: boolean) => {
    setAllowMessageRequests(value);
    try {
      await api.patch("/users/me/message-settings", {
        allow_message_requests: value,
      });
      await refreshProfile();
    } catch (error) {
      console.error("Failed to update message request setting", error);
      setAllowMessageRequests(!value);
      Alert.alert("오류", "메시지 요청 설정을 변경하지 못했습니다.");
    }
  };

  const handlePickProfileImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("권한 필요", "프로필 사진을 변경하려면 갤러리 접근 권한이 필요합니다.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedAsset(result.assets[0]);
      }
    } catch (e) {
      console.error("Error picking profile image", e);
      Alert.alert("오류", "프로필 이미지 선택 중 오류가 발생했습니다.");
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      let finalImageUrl = profileImageUrl;

      if (selectedAsset) {
        const formData = new FormData();
        const filename = selectedAsset.fileName || `avatar_${Date.now()}.jpg`;
        const match = /\.(\w+)$/.exec(filename);
        const type = selectedAsset.mimeType || (match ? `image/${match[1]}` : "image/jpeg");

        formData.append("file", {
          uri: selectedAsset.uri,
          name: filename,
          type,
        } as any);

        const uploadRes = await api.post("/uploads/image", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });

        if (uploadRes.data && uploadRes.data.data) {
          finalImageUrl = uploadRes.data.data.url;
        }
      }

      await api.patch("/users/me", {
        full_name: fullName,
        bio: bio,
        profile_image_url: finalImageUrl,
      });

      await refreshProfile();
      Alert.alert("성공", "프로필 정보가 수정되었습니다.", [
        { text: "확인", onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.detail ||
        "프로필 수정 중 오류가 발생했습니다.";
      Alert.alert("수정 실패", msg);
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) {
      Alert.alert("알림", "현재 비밀번호와 새 비밀번호를 모두 입력해주세요.");
      return;
    }
    setChangingPassword(true);
    try {
      await api.post("/users/me/password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setShowPasswordSection(false);
      Alert.alert("성공", "비밀번호가 성공적으로 변경되었습니다.");
    } catch (err: any) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.detail ||
        "비밀번호 변경 실패";
      Alert.alert("비밀번호 변경 실패", msg);
    } finally {
      setChangingPassword(false);
    }
  };

  const currentAvatarUri = selectedAsset
    ? selectedAsset.uri
    : getFullImageUrl(profileImageUrl);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Text style={styles.cancelText}>취소</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>프로필 편집</Text>
        <TouchableOpacity onPress={handleSaveProfile} disabled={saving} style={styles.headerBtn}>
          {saving ? (
            <ActivityIndicator size="small" color="#0095f6" />
          ) : (
            <Text style={styles.doneText}>완료</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
        {/* Avatar Section */}
        <TouchableOpacity style={styles.avatarSection} onPress={handlePickProfileImage} activeOpacity={0.8}>
          <Image source={{ uri: currentAvatarUri }} style={styles.avatar} />
          <Text style={styles.changeAvatarText}>프로필 사진 변경 (갤러리에서 선택)</Text>
          <Text style={styles.usernameText}>@{user?.username}</Text>
        </TouchableOpacity>

        {/* Profile Inputs Form */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>이름</Text>
          <TextInput
            style={styles.input}
            placeholder="이름을 입력하세요"
            placeholderTextColor="#8e8e8e"
            value={fullName}
            onChangeText={setFullName}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>소개 (Bio)</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            placeholder="자기소개를 입력하세요"
            placeholderTextColor="#8e8e8e"
            value={bio}
            onChangeText={setBio}
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Account Privacy Toggle */}
        <View style={styles.privacyRow}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <Ionicons name="lock-closed-outline" size={16} color="#fff" />
              <Text style={styles.privacyTitle}>비공개 계정</Text>
            </View>
            <Text style={styles.privacySub}>
              계정이 비공개로 설정되면 승인된 사람만 내 프로필과 사진을 볼 수 있습니다.
            </Text>
          </View>
          <Switch
            value={isPrivate}
            onValueChange={handleTogglePrivacy}
            trackColor={{ false: "#3a3a3c", true: "#0095f6" }}
            thumbColor="#fff"
          />
        </View>

        <View style={styles.privacyRow}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <Ionicons name="chatbubble-ellipses-outline" size={16} color="#fff" />
              <Text style={styles.privacyTitle}>비팔로워 메시지 요청</Text>
            </View>
            <Text style={styles.privacySub}>
              끄면 서로 팔로우하지 않은 사용자가 새 메시지 요청을 보낼 수 없습니다.
            </Text>
          </View>
          <Switch
            value={allowMessageRequests}
            onValueChange={handleToggleMessageRequests}
            trackColor={{ false: "#3a3a3c", true: "#0095f6" }}
            thumbColor="#fff"
          />
        </View>

        {/* Password Change Toggle Button */}
        <TouchableOpacity
          style={styles.passwordToggleBtn}
          onPress={() => setShowPasswordSection(!showPasswordSection)}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Ionicons name="key-outline" size={16} color="#0095f6" />
            <Text style={styles.passwordToggleText}>비밀번호 변경</Text>
            <Ionicons name={showPasswordSection ? "chevron-up" : "chevron-down"} size={16} color="#0095f6" />
          </View>
        </TouchableOpacity>

        {/* Password Change Form */}
        {showPasswordSection ? (
          <View style={styles.passwordContainer}>
            <View style={styles.formGroup}>
              <Text style={styles.label}>현재 비밀번호</Text>
              <TextInput
                style={styles.input}
                placeholder="현재 비밀번호"
                placeholderTextColor="#8e8e8e"
                secureTextEntry
                value={currentPassword}
                onChangeText={setCurrentPassword}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>새 비밀번호</Text>
              <TextInput
                style={styles.input}
                placeholder="8자 이상, 대문자+숫자 포함"
                placeholderTextColor="#8e8e8e"
                secureTextEntry
                value={newPassword}
                onChangeText={setNewPassword}
              />
            </View>

            <TouchableOpacity
              style={styles.changePasswordBtn}
              onPress={handleChangePassword}
              disabled={changingPassword}
            >
              {changingPassword ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.changePasswordBtnText}>비밀번호 변경 완료</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
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
    borderBottomWidth: 0.5,
    borderBottomColor: "#262626",
  },
  headerBtn: {
    padding: 6,
  },
  cancelText: {
    color: "#fff",
    fontSize: 16,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  doneText: {
    color: "#0095f6",
    fontSize: 16,
    fontWeight: "bold",
  },
  avatarSection: {
    alignItems: "center",
    marginVertical: 20,
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    marginBottom: 8,
  },
  changeAvatarText: {
    color: "#0095f6",
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 4,
  },
  usernameText: {
    color: "#8e8e8e",
    fontSize: 14,
  },
  formGroup: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  label: {
    color: "#8e8e8e",
    fontSize: 13,
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#121212",
    borderColor: "#262626",
    borderWidth: 1,
    borderRadius: 8,
    color: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    lineHeight: 22,
  },
  multilineInput: {
    minHeight: 80,
    paddingTop: 10,
    paddingBottom: 10,
    textAlignVertical: "top",
  },
  passwordToggleBtn: {
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 16,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#1c1c1e",
    borderRadius: 8,
  },
  passwordToggleText: {
    color: "#0095f6",
    fontWeight: "bold",
    fontSize: 14,
  },
  passwordContainer: {
    borderTopWidth: 0.5,
    borderTopColor: "#262626",
    paddingTop: 16,
    marginBottom: 30,
  },
  changePasswordBtn: {
    backgroundColor: "#ef4444",
    marginHorizontal: 20,
    marginTop: 10,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  changePasswordBtnText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 15,
  },
  privacyRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginVertical: 14,
    padding: 14,
    backgroundColor: "#121212",
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: "#262626",
  },
  privacyTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "bold",
    marginBottom: 4,
  },
  privacySub: {
    color: "#8e8e8e",
    fontSize: 12,
    lineHeight: 16,
    marginRight: 10,
  },
});
