import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "../../../context/ThemeContext";
import { useAuth } from "../../../context/AuthContext";
import { getDisplayName } from "../../../utils/displayName";
import { AdminAvatar } from "../../../components/AdminIdentity";

import { directService } from "../services/directService";
import { useDirectChat } from "../hooks/useDirectChat";
import { DirectMessageList } from "../components/DirectMessageList";
import { DirectComposer } from "../components/DirectComposer";
import { DirectUser } from "../types/direct";

export const DirectChatScreen: React.FC = () => {
  const { colors } = useTheme();
  const { user: currentUser } = useAuth();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const { conversationId, targetUser: initialTargetUser } = route.params || {};

  const [targetUser, setTargetUser] = useState<DirectUser | null>(initialTargetUser || null);
  const [loadingUser, setLoadingUser] = useState<boolean>(!initialTargetUser && !!conversationId);

  const {
    messages,
    loading: loadingMessages,
    loadingMore,
    sendMessage,
    loadMoreMessages,
  } = useDirectChat(conversationId || "");

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
          console.log("Error loading conversation detail in DirectChatScreen", err);
        })
        .finally(() => {
          setLoadingUser(false);
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

        {loadingUser ? (
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

      {/* Main Body with Keyboard Avoidance */}
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {loadingMessages ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.accentPurple} />
          </View>
        ) : (
          <DirectMessageList
            messages={messages}
            currentUserId={currentUser?.id}
            loadingMore={loadingMore}
            onLoadMore={loadMoreMessages}
          />
        )}

        {/* Message Input Bar */}
        <DirectComposer onSend={sendMessage} />
      </KeyboardAvoidingView>
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
    width: 34,
    height: 34,
    borderRadius: 17,
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  keyboardView: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
