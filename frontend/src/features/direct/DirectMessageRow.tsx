import React from "react";
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
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
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
  onOpenPost: (postId: string) => void;
  onRetry: (message: DirectMessage) => void;
}

export const DirectMessageRow = ({
  message,
  isMine,
  availableWidth,
  isFirstInGroup = true,
  isLastInGroup = true,
  onOpenPost,
  onRetry,
}: DirectMessageRowProps) => {
  const { colors } = useTheme();
  const maxContentWidth = Math.max(
    180,
    Math.min(availableWidth - 20, availableWidth * 0.86)
  );
  const nickname = getDisplayName(message.sender, isMine ? "나" : "사용자");
  const deliveryLabel = getDeliveryLabel(message);

  return (
    <View style={styles.container}>
      {/* Group divider line when speaker changes */}
      {isFirstInGroup && (
        <View
          style={[
            styles.groupDivider,
            { borderTopColor: colors.borderLight },
          ]}
        />
      )}

      <View
        style={[
          styles.row,
          isMine ? styles.myRow : styles.otherRow,
          { marginTop: isFirstInGroup ? 6 : 2 },
        ]}
      >
        {!isMine && (
          isFirstInGroup ? (
            <AdminAvatar user={message.sender} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder} />
          )
        )}

        <View style={[styles.column, { maxWidth: maxContentWidth }]}>
          {!isMine && isFirstInGroup && (
            <View style={styles.metadata}>
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
          )}

          {message.message_type === "IMAGE" && message.media_url ? (
            <Image
              source={{ uri: getFullImageUrl(message.media_url) }}
              resizeMode="cover"
              style={[
                styles.image,
                { width: Math.min(248, maxContentWidth) },
              ]}
            />
          ) : message.message_type === "POST" && message.shared_post_id ? (
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => onOpenPost(message.shared_post_id!)}
              style={[
                styles.postCard,
                {
                  backgroundColor: colors.bgCard,
                  borderColor: colors.borderLight,
                },
              ]}
            >
              <View
                style={[
                  styles.postIcon,
                  { backgroundColor: colors.accentPurple + "14" },
                ]}
              >
                <Ionicons
                  name="albums-outline"
                  size={20}
                  color={colors.accentPurple}
                />
              </View>
              <View style={styles.postCopy}>
                <Text
                  style={[styles.postTitle, { color: colors.textPrimary }]}
                >
                  공유한 게시물
                </Text>
                <Text
                  style={[styles.postAction, { color: colors.textSecondary }]}
                >
                  눌러서 게시물 보기
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.textMuted}
              />
            </TouchableOpacity>
          ) : (
            <Text
              selectable
              textBreakStrategy="simple"
              android_hyphenationFrequency="none"
              style={[
                styles.plainMessageText,
                isMine ? styles.myTextAlignment : styles.otherTextAlignment,
                { color: colors.textPrimary },
              ]}
            >
              {message.content || ""}
            </Text>
          )}

          {/* Group Last Message Metadata (Time & Read Status) */}
          {isLastInGroup && (
            <View
              style={[
                styles.deliveryRow,
                isMine ? styles.myDeliveryRow : styles.otherDeliveryRow,
              ]}
            >
              {isMine && (
                <TouchableOpacity
                  activeOpacity={message.local_status === "failed" ? 0.6 : 1}
                  disabled={message.local_status !== "failed"}
                  onPress={() => onRetry(message)}
                  style={styles.retryButton}
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
                </TouchableOpacity>
              )}
              <Text style={[styles.deliveryText, { color: colors.textMuted }]}>
                {isMine
                  ? `${formatMessageClock(message.created_at)}  ${deliveryLabel}`
                  : formatMessageClock(message.created_at)}
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  groupDivider: {
    width: "100%",
    borderTopWidth: 0.5,
    marginTop: 18,
    marginBottom: 6,
    opacity: 0.4,
  },
  row: {
    width: "100%",
    flexDirection: "row",
    paddingHorizontal: 12,
  },
  myRow: {
    justifyContent: "flex-end",
    alignItems: "flex-end",
  },
  otherRow: {
    justifyContent: "flex-start",
    alignItems: "flex-start",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 12,
    marginRight: 9,
    marginTop: 2,
  },
  avatarPlaceholder: {
    width: 32,
    marginRight: 9,
  },
  column: {},
  metadata: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  nickname: {
    maxWidth: 150,
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: "700",
  },
  clock: {
    fontSize: 11,
    lineHeight: 15,
    marginLeft: 2,
  },
  plainMessageText: {
    fontSize: 15.5,
    lineHeight: 22,
    includeFontPadding: false,
    paddingVertical: 2,
  },
  myTextAlignment: {
    textAlign: "right",
  },
  otherTextAlignment: {
    textAlign: "left",
  },
  image: {
    height: 230,
    borderRadius: 12,
    backgroundColor: "#27272a",
    marginVertical: 2,
  },
  postCard: {
    minWidth: 190,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginVertical: 2,
  },
  postIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  postCopy: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: 8,
  },
  postTitle: {
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: "700",
  },
  postAction: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 15,
  },
  deliveryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 3,
    marginBottom: 2,
  },
  myDeliveryRow: {
    justifyContent: "flex-end",
  },
  otherDeliveryRow: {
    justifyContent: "flex-start",
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
  },
  deliveryText: {
    fontSize: 10.5,
    lineHeight: 15,
    fontWeight: "500",
  },
});
