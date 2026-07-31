import React from "react";
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../../context/ThemeContext";
import { AdminAvatar, AdminBadge } from "../../components/AdminIdentity";
import { getFullImageUrl } from "../../config";
import { getDisplayName } from "../../utils/displayName";
import { formatMessageClock, getDeliveryLabel } from "./formatters";
import { DirectMessage } from "./types";

interface DirectMessageRowProps {
  message: DirectMessage;
  isMine: boolean;
  availableWidth: number;
  onOpenPost: (postId: string) => void;
  onRetry: (message: DirectMessage) => void;
}

const MessageSurface = ({
  isMine,
  children,
}: {
  isMine: boolean;
  children: React.ReactNode;
}) => {
  const { colors } = useTheme();
  if (isMine) {
    return (
      <LinearGradient
        colors={["#7652df", "#6659e8", "#4f75eb"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.surface}
      >
        {children}
      </LinearGradient>
    );
  }
  return (
    <View
      style={[
        styles.surface,
        styles.otherSurface,
        {
          backgroundColor: colors.bgCard,
          borderColor: colors.borderLight,
        },
      ]}
    >
      {children}
    </View>
  );
};

export const DirectMessageRow = ({
  message,
  isMine,
  availableWidth,
  onOpenPost,
  onRetry,
}: DirectMessageRowProps) => {
  const { colors } = useTheme();
  const maxContentWidth = Math.max(
    180,
    Math.min(availableWidth - 54, availableWidth * 0.82)
  );
  const nickname = getDisplayName(message.sender, isMine ? "나" : "사용자");
  const deliveryLabel = getDeliveryLabel(message);

  return (
    <View
      style={[
        styles.row,
        isMine ? styles.myRow : styles.otherRow,
      ]}
    >
      {!isMine && (
        <AdminAvatar user={message.sender} style={styles.avatar} />
      )}
      <View style={[styles.column, { width: maxContentWidth }]}>
        <View
          style={[
            styles.metadata,
            isMine && styles.myMetadata,
          ]}
        >
          <Text
            numberOfLines={1}
            style={[styles.nickname, { color: colors.textPrimary }]}
          >
            {nickname}
          </Text>
          {message.sender.is_admin && <AdminBadge compact />}
          <Text style={[styles.clock, { color: colors.textMuted }]}>
            {formatMessageClock(message.created_at)}
          </Text>
        </View>

        <MessageSurface isMine={isMine}>
          {message.message_type === "IMAGE" && message.media_url ? (
            <Image
              source={{ uri: getFullImageUrl(message.media_url) }}
              resizeMode="cover"
              style={[
                styles.image,
                { width: Math.min(248, maxContentWidth - 22) },
              ]}
            />
          ) : message.message_type === "POST" && message.shared_post_id ? (
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => onOpenPost(message.shared_post_id!)}
              style={styles.postContent}
            >
              <View
                style={[
                  styles.postIcon,
                  {
                    backgroundColor: isMine
                      ? "rgba(255,255,255,0.16)"
                      : colors.accentPurple + "14",
                  },
                ]}
              >
                <Ionicons
                  name="albums-outline"
                  size={22}
                  color={isMine ? "#ffffff" : colors.accentPurple}
                />
              </View>
              <View style={styles.postCopy}>
                <Text
                  style={[
                    styles.postTitle,
                    { color: isMine ? "#ffffff" : colors.textPrimary },
                  ]}
                >
                  공유한 게시물
                </Text>
                <Text
                  style={[
                    styles.postAction,
                    {
                      color: isMine
                        ? "rgba(255,255,255,0.76)"
                        : colors.textSecondary,
                    },
                  ]}
                >
                  눌러서 게시물 보기
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={isMine ? "#ffffff" : colors.textMuted}
              />
            </TouchableOpacity>
          ) : (
            <Text
              selectable
              textBreakStrategy="simple"
              style={[
                styles.messageText,
                { color: isMine ? "#ffffff" : colors.textPrimary },
              ]}
            >
              {message.content || ""}
            </Text>
          )}
        </MessageSurface>

        {isMine && (
          <TouchableOpacity
            activeOpacity={message.local_status === "failed" ? 0.6 : 1}
            disabled={message.local_status !== "failed"}
            onPress={() => onRetry(message)}
            style={styles.deliveryRow}
          >
            {message.local_status === "pending" && (
              <Ionicons
                name="time-outline"
                size={12}
                color={colors.textMuted}
              />
            )}
            {message.local_status === "failed" && (
              <Ionicons
                name="alert-circle-outline"
                size={13}
                color="#ef4444"
              />
            )}
            {message.local_status === "read" && (
              <Ionicons
                name="checkmark-done"
                size={14}
                color={colors.accentCyan}
              />
            )}
            <Text
              style={[
                styles.deliveryText,
                {
                  color:
                    message.local_status === "failed"
                      ? "#ef4444"
                      : message.local_status === "read"
                        ? colors.accentCyan
                        : colors.textMuted,
                },
              ]}
            >
              {deliveryLabel}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    width: "100%",
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    marginVertical: 7,
    paddingHorizontal: 12,
  },
  myRow: {
    justifyContent: "flex-end",
  },
  otherRow: {
    justifyContent: "flex-start",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 12,
    marginRight: 9,
    marginTop: 20,
  },
  column: {
    minWidth: 0,
    flexShrink: 1,
  },
  metadata: {
    minHeight: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 5,
    paddingHorizontal: 2,
  },
  myMetadata: {
    justifyContent: "flex-end",
  },
  nickname: {
    maxWidth: 150,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
  clock: {
    fontSize: 10.5,
    lineHeight: 15,
  },
  surface: {
    width: "100%",
    minWidth: 72,
    flexShrink: 1,
    borderRadius: 17,
    paddingLeft: 14,
    paddingRight: 18,
    paddingVertical: 11,
    overflow: "visible",
  },
  otherSurface: {
    borderWidth: 1,
  },
  messageText: {
    minWidth: 0,
    maxWidth: "100%",
    flexShrink: 1,
    fontSize: 15.5,
    lineHeight: 23,
    includeFontPadding: false,
    paddingRight: 6,
  },
  image: {
    height: 230,
    borderRadius: 12,
    backgroundColor: "#27272a",
  },
  postContent: {
    minWidth: 190,
    flexDirection: "row",
    alignItems: "center",
  },
  postIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  postCopy: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: 10,
  },
  postTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "800",
  },
  postAction: {
    marginTop: 2,
    fontSize: 11.5,
    lineHeight: 16,
  },
  deliveryRow: {
    minHeight: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 3,
    paddingTop: 4,
    paddingRight: 2,
  },
  deliveryText: {
    fontSize: 10.5,
    lineHeight: 15,
    fontWeight: "600",
  },
});
