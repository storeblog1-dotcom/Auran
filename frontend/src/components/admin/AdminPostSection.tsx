import React from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../theme/colors";
import { AdminPostItem } from "../../services/adminService";
import { getDisplayName } from "../../utils/displayName";
import { AdminBadge } from "../AdminIdentity";
import { getFullImageUrl } from "../../config";

export interface AdminPostSectionProps {
  posts: AdminPostItem[];
  contentScope: "feed" | "community";
  totalPosts: number;
  loading: boolean;
  refreshing: boolean;
  colors: ThemeColors;
  primaryAccent: string;
  onChangeScope: (scope: "feed" | "community") => void;
  onSelectReportsTab: () => void;
  onRefresh: () => void;
  onSelectPost: (post: AdminPostItem) => void;
  onOpenManagementMenu: (post: AdminPostItem) => void;
  onDeletePost: (post: AdminPostItem) => void;
}

export const AdminPostSection: React.FC<AdminPostSectionProps> = ({
  posts,
  contentScope,
  totalPosts,
  loading,
  refreshing,
  colors,
  primaryAccent,
  onChangeScope,
  onSelectReportsTab,
  onRefresh,
  onSelectPost,
  onOpenManagementMenu,
  onDeletePost,
}) => {
  return (
    <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 12 }}>
      <View style={styles.subnavRow}>
        <TouchableOpacity
          onPress={() => onChangeScope("feed")}
          style={[
            styles.subnavButton,
            {
              borderColor: contentScope === "feed" ? primaryAccent : colors.borderColor,
              backgroundColor: contentScope === "feed" ? `${primaryAccent}18` : "transparent",
            },
          ]}
        >
          <Text
            style={{
              color: contentScope === "feed" ? primaryAccent : colors.textSecondary,
              fontWeight: "700",
            }}
          >
            피드
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onChangeScope("community")}
          style={[
            styles.subnavButton,
            {
              borderColor: contentScope === "community" ? primaryAccent : colors.borderColor,
              backgroundColor: contentScope === "community" ? `${primaryAccent}18` : "transparent",
            },
          ]}
        >
          <Text
            style={{
              color: contentScope === "community" ? primaryAccent : colors.textSecondary,
              fontWeight: "700",
            }}
          >
            게시판
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onSelectReportsTab}
          style={[styles.subnavButton, { borderColor: colors.borderColor }]}
        >
          <Text style={{ color: colors.textSecondary, fontWeight: "700" }}>신고됨</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.countText, { color: colors.textMuted }]}>
        최신순 · 총 {totalPosts}개
      </Text>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} size="large" color={primaryAccent} />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          key={`content-grid-${contentScope}`}
          numColumns={3}
          columnWrapperStyle={styles.contentGridRow}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={primaryAccent}
            />
          }
          renderItem={({ item }) => {
            const firstMedia = item.media && item.media.length > 0 ? item.media[0] : null;
            const mediaUrl = firstMedia
              ? firstMedia.media_url || firstMedia.url || firstMedia.image_url
              : null;

            return (
              <TouchableOpacity
                activeOpacity={0.8}
                style={[
                  styles.contentTile,
                  { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
                ]}
                onPress={() => onSelectPost(item)}
              >
                <View style={styles.contentTileHeader}>
                  <View style={styles.contentTileAuthorRow}>
                    <Ionicons name="eye-outline" size={16} color={primaryAccent} />
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      style={[styles.postAuthor, styles.contentTileAuthor, { color: primaryAccent }]}
                    >
                      {getDisplayName(item.author, "알 수 없음")}
                    </Text>
                    {item.author.is_admin && <AdminBadge compact />}
                  </View>
                  <View style={styles.contentTileMenu}>
                    {item.moderation_hidden && (
                      <View style={styles.hiddenBadge}>
                        <Ionicons name="eye-off-outline" size={11} color="#b45309" />
                      </View>
                    )}
                    <TouchableOpacity
                      style={styles.contentTileMenuButton}
                      accessibilityLabel="콘텐츠 관리 메뉴"
                      hitSlop={8}
                      onPress={(event) => {
                        event.stopPropagation();
                        onOpenManagementMenu(item);
                      }}
                    >
                      <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.contentTileBody}>
                  {mediaUrl ? (
                    <Image
                      source={{ uri: getFullImageUrl(mediaUrl) }}
                      style={styles.contentTileImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View
                      style={[
                        styles.contentTileText,
                        { backgroundColor: colors.bgPrimary, borderColor: colors.borderColor },
                      ]}
                    >
                      <Ionicons name="document-text-outline" size={22} color={colors.textMuted} />
                    </View>
                  )}

                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.postCaption, { color: colors.textPrimary, marginTop: 0 }]}
                      numberOfLines={2}
                    >
                      {item.caption || "(캡션 없음)"}
                    </Text>
                    {item.media && item.media.length > 1 && (
                      <Text
                        style={{
                          color: primaryAccent,
                          fontSize: 11,
                          marginTop: 2,
                          fontWeight: "600",
                        }}
                      >
                        📷 미디어 {item.media.length}개
                      </Text>
                    )}
                  </View>
                </View>

                <View style={styles.contentTileFooter}>
                  <Text style={{ display: "none" }}>👆 클릭하여 상세 팝업 보기</Text>
                  <TouchableOpacity
                    style={styles.contentTileDeleteBtn}
                    onPress={() => onDeletePost(item)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-outline" size={14} color="#ef4444" />
                    <Text style={{ color: "#ef4444", fontSize: 12, fontWeight: "600", marginLeft: 4 }}>
                      강제 삭제
                    </Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  subnavRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  subnavButton: {
    flex: 1,
    minHeight: 38,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  countText: {
    fontSize: 13,
    marginBottom: 12,
  },
  contentGridRow: { gap: 7, marginBottom: 7 },
  contentTile: {
    flex: 1,
    maxWidth: "32.2%",
    minHeight: 198,
    padding: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  contentTileHeader: { flexDirection: "row", alignItems: "center", minHeight: 22 },
  contentTileAuthorRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingRight: 3,
  },
  contentTileAuthor: { flexShrink: 1, minWidth: 0, fontSize: 13 },
  contentTileMenu: { width: 24, alignItems: "flex-end", justifyContent: "center" },
  contentTileMenuButton: { width: 24, height: 24, alignItems: "center", justifyContent: "center" },
  contentTileBody: {
    flex: 1,
    flexDirection: "column",
    marginTop: 8,
    gap: 7,
    alignItems: "stretch",
  },
  contentTileImage: { width: "100%", height: 82, borderRadius: 7, backgroundColor: "#ccc" },
  contentTileText: {
    width: "100%",
    height: 82,
    borderRadius: 7,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    padding: 7,
  },
  postAuthor: {
    fontSize: 14,
    fontWeight: "bold",
  },
  postCaption: {
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
  },
  contentTileFooter: {
    minHeight: 34,
    marginTop: 6,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  contentTileDeleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 30,
    paddingHorizontal: 7,
    borderRadius: 8,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.4)",
  },
  hiddenBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fef3c7",
  },
});
