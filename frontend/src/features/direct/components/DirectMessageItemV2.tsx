import React, { useEffect } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../context/ThemeContext";
import { AdminAvatar, AdminBadge } from "../../../components/AdminIdentity";
import { getFullImageUrl } from "../../../config";
import { getDisplayName } from "../../../utils/displayName";
import {
  fixPunctuationLineBreak,
  formatMessageClock,
  getDeliveryLabel,
} from "../formatters";
import { DirectMessage } from "../types";

export interface DirectMessageItemV2Props {
  message: DirectMessage;
  isMine: boolean;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
  onOpenPost?: (postId: string) => void;
  onRetry?: (message: DirectMessage) => void;
}

export const DirectMessageItemV2 = ({
  message,
  isMine,
  isFirstInGroup = true,
  isLastInGroup = true,
  onOpenPost,
  onRetry,
}: DirectMessageItemV2Props) => {
  const { colors } = useTheme();
  const nickname = getDisplayName(message.sender, isMine ? "나" : "사용자");
  const deliveryLabel = getDeliveryLabel(message);
  const stableKey = message.client_message_id || message.id;

  useEffect(() => {
    console.log("[DM_V2_ITEM_MOUNT]", {
      id: message.id,
      clientId: message.client_message_id,
      status: message.local_status,
      content: message.content,
    });
    return () => {
      console.log("[DM_V2_ITEM_UNMOUNT]", {
        id: message.id,
        clientId: message.client_message_id,
      });
    };
  }, [stableKey]);

  return (
    <View style={styles.container}>
      {/* Speaker change group divider */}
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
          { marginTop: isFirstInGroup ? 4 : 1 },
        ]}
      >
        {/* Other user avatar or placeholder */}
        {!isMine && (
          isFirstInGroup ? (
            <AdminAvatar user={message.sender} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder} />
          )
        )}

        {/* Message item wrapper */}
        <View style={styles.item}>
          {/* Header metadata for other user on group start */}
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

          {/* Media, Post, or Plain Text */}
          {message.message_type === "IMAGE" && message.media_url ? (
            <Image
              source={{ uri: getFullImageUrl(message.media_url) }}
              resizeMode="cover"
              style={styles.image}
            />
          ) : message.message_type === "POST" && message.shared_post_id ? (
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => onOpenPost?.(message.shared_post_id!)}
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
                <Text style={[styles.postTitle, { color: colors.textPrimary }]}>
                  공유한 게시물
                </Text>
                <Text style={[styles.postAction, { color: colors.textSecondary }]}>
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
              style={[styles.messageText, { color: colors.textPrimary }]}
              onTextLayout={(event) => {
                console.log("[DM_V2_TRACE] RENDER_MESSAGE", {
                  at: Date.now(),
                  phase:
                    message.local_status === "pending"
                      ? "optimistic"
                      : "confirmed",
                  id: message.id,
                  clientId: message.client_message_id,
                  content: message.content,
                  status: message.local_status,
                  linesCount: event.nativeEvent.lines.length,
                  lines: event.nativeEvent.lines.map((line, index) => ({
                    index,
                    text: line.text,
                    width: line.width,
                  })),
                });
              }}
            >
              {fixPunctuationLineBreak(message.content)}
            </Text>
          )}

          {/* Meta row for group last message */}
          {isLastInGroup ? (
            <View
              style={[
                styles.metaRow,
                isMine ? styles.myMetaRow : styles.otherMetaRow,
              ]}
            >
              {isMine && (
                <TouchableOpacity
                  activeOpacity={message.local_status === "failed" ? 0.6 : 1}
                  disabled={message.local_status !== "failed"}
                  onPress={() => onRetry?.(message)}
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
              <Text style={[styles.metaText, { color: colors.textMuted }]}>
                {isMine
                  ? `${formatMessageClock(message.created_at)}  ${deliveryLabel}`
                  : formatMessageClock(message.created_at)}
              </Text>
            </View>
          ) : (
            <View
              style={[
                styles.subtleMessageDivider,
                { backgroundColor: colors.borderLight },
              ]}
            />
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
    borderTopWidth: 0.8,
    marginTop: 20,
    marginBottom: 8,
    opacity: 0.4,
  },
  subtleMessageDivider: {
    height: StyleSheet.hairlineWidth,
    opacity: 0.2,
    marginTop: 6,
    marginBottom: 4,
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
  item: {
    maxWidth: "86%",
  },
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
  messageText: {
    fontSize: 15.5,
    lineHeight: 24,
    includeFontPadding: false,
    paddingVertical: 2,
  },
  image: {
    width: 240,
    maxWidth: "100%",
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
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 3,
    marginBottom: 2,
  },
  myMetaRow: {
    justifyContent: "flex-end",
  },
  otherMetaRow: {
    justifyContent: "flex-start",
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
  },
  metaText: {
    fontSize: 10.5,
    lineHeight: 15,
    fontWeight: "500",
  },
});
