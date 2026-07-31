import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "../../../context/ThemeContext";
import { getDisplayName } from "../../../utils/displayName";
import { AdminAvatar } from "../../../components/AdminIdentity";
import { directService } from "../services/directService";
import { DirectUser } from "../types/direct";

export const DirectChatScreen: React.FC = () => {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const { conversationId, targetUser: initialTargetUser } = route.params || {};

  const [targetUser, setTargetUser] = useState<DirectUser | null>(initialTargetUser || null);
  const [loading, setLoading] = useState<boolean>(!initialTargetUser && !!conversationId);

  useEffect(() => {
    if (!targetUser && conversationId) {
      directService
        .getConversationById(conversationId)
        .then((data) => {
          if (data?.target_user) {
            setTargetUser(data.target_user);
          }
        })
        .catch((err) => {
          console.log("Error loading conversation detail", err);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [conversationId, targetUser]);

  const displayName = getDisplayName(targetUser);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.borderLight }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>

        {loading ? (
          <ActivityIndicator size="small" color={colors.accentPurple} />
        ) : (
          <View style={styles.headerTitleContainer}>
            <AdminAvatar user={targetUser} style={styles.headerAvatar} />
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {displayName}
            </Text>
          </View>
        )}
      </View>

      {/* Main Body */}
      <View style={styles.body}>
        <Ionicons name="chatbubbles-outline" size={64} color={colors.textMuted} />
        <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
          아직 대화를 시작하지 않았습니다.
        </Text>
      </View>

      {/* Disabled Input Bar (Phase 2 Preview) */}
      <View style={[styles.inputContainer, { backgroundColor: colors.bgInput, borderTopColor: colors.borderLight }]}>
        <TextInput
          style={[styles.input, { color: colors.textMuted }]}
          placeholder="2단계 구현 예정"
          placeholderTextColor={colors.textMuted}
          editable={false}
        />
        <TouchableOpacity style={styles.sendButton} disabled activeOpacity={0.5}>
          <Text style={[styles.sendButtonText, { color: colors.textMuted }]}>전송</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
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
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
    marginRight: 4,
  },
  headerTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  headerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  placeholderText: {
    fontSize: 16,
    marginTop: 16,
    fontWeight: "500",
    textAlign: "center",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 16,
    fontSize: 14,
  },
  sendButton: {
    marginLeft: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sendButtonText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
