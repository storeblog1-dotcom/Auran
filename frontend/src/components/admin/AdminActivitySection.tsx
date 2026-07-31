import React from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../theme/colors";
import { AdminActivityUser, AdminContentHistoryItem } from "../../services/adminService";
import { getFullImageUrl } from "../../config";

export interface AdminActivitySectionProps {
  activityUsers: AdminActivityUser[];
  activityQuery: string;
  totalActivityUsers: number;
  loading: boolean;
  activityLoadingMore: boolean;
  expandedActivityUserId: string | null;
  activityContent: any;
  activityContentLoading: boolean;
  expandedHistoryKey: string | null;
  activityHistory: AdminContentHistoryItem[];
  activityHistoryLoading: boolean;
  colors: ThemeColors;
  primaryAccent: string;
  onChangeActivityQuery: (query: string) => void;
  onSubmitSearch: () => void;
  onSelectUsersTab: () => void;
  onLoadMoreUsers: () => void;
  onToggleActivityUser: (user: AdminActivityUser) => void;
  onOpenUser360Modal: (user: AdminActivityUser) => void;
  onOpenActivityContent: (content: any, contentType: "post" | "comment") => void;
  onToggleContentHistory: (contentType: "post" | "comment", contentId: string) => void;
  onLoadMoreActivityContent: (userId: string) => void;
  onOpenRevisionModal: (revisionId: string) => void;
}

export const AdminActivitySection: React.FC<AdminActivitySectionProps> = ({
  activityUsers,
  activityQuery,
  activityLoadingMore,
  expandedActivityUserId,
  activityContent,
  activityContentLoading,
  expandedHistoryKey,
  activityHistory,
  activityHistoryLoading,
  colors,
  primaryAccent,
  onChangeActivityQuery,
  onSubmitSearch,
  onSelectUsersTab,
  onLoadMoreUsers,
  onToggleActivityUser,
  onOpenUser360Modal,
  onOpenActivityContent,
  onToggleContentHistory,
  onLoadMoreActivityContent,
  onOpenRevisionModal,
}) => {
  const renderContentHistory = (historyKey: string) => {
    if (expandedHistoryKey !== historyKey) return null;
    return (
      <View style={[styles.historyPanel, { borderColor: colors.borderColor }]}>
        {activityHistoryLoading ? (
          <ActivityIndicator style={{ marginVertical: 8 }} color={primaryAccent} />
        ) : activityHistory.length === 0 ? (
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            보존된 변경 이력이 없습니다.
          </Text>
        ) : (
          activityHistory.map((history) => (
            <TouchableOpacity
              key={history.revision_id}
              activeOpacity={0.75}
              onPress={(event) => {
                event.stopPropagation();
                onOpenRevisionModal(history.revision_id);
              }}
              style={[styles.historyRow, { borderBottomColor: colors.borderColor }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: primaryAccent, fontWeight: "700", fontSize: 12 }}>
                  버전 {history.version} · {history.lifecycle_event}
                </Text>
                <Text
                  numberOfLines={2}
                  style={{ color: colors.textPrimary, marginTop: 3, fontSize: 12 }}
                >
                  {history.display_text || "(내용 없음)"}
                </Text>
                <Text style={{ color: colors.textMuted, marginTop: 3, fontSize: 11 }}>
                  {new Date(history.event_at).toLocaleString()} · IP {history.event_ip || "기록 없음"}
                </Text>
              </View>
              <Text style={{ color: primaryAccent, fontSize: 11, fontWeight: "700" }}>상세 보기</Text>
            </TouchableOpacity>
          ))
        )}
      </View>
    );
  };

  const renderActivityContentRow = (content: any, contentType: "post" | "comment") => {
    const historyKey = `${contentType}:${content.id}`;
    const mediaUrl =
      content.media?.[0]?.media_url ||
      content.media?.[0]?.url ||
      content.media_manifest?.[0]?.media_url ||
      content.image_url ||
      content.url ||
      null;
    const dateText = content.latest_event_at || content.created_at;
    const formattedDate = dateText
      ? new Date(dateText).toLocaleString("ko-KR", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "시간 기록 없음";

    return (
      <View key={historyKey}>
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={(event) => {
            event.stopPropagation();
            onOpenActivityContent(content, contentType);
          }}
          style={[styles.activityContentRow, { borderColor: colors.borderColor }]}
        >
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <Text style={{ color: primaryAccent, fontWeight: "700", fontSize: 12 }}>
                [{content.content_type || (contentType === "post" ? "게시물" : "댓글")}] [{content.board_label || "피드"}] {content.content_number || ""}
              </Text>
            </View>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
              <View style={{ flex: 1 }}>
                {contentType === "post" && !!content.title && (
                  <Text
                    style={{ color: colors.textPrimary, fontWeight: "bold", fontSize: 13, marginBottom: 2 }}
                    numberOfLines={1}
                  >
                    {content.title}
                  </Text>
                )}
                <Text
                  numberOfLines={3}
                  style={{ color: colors.textPrimary, fontSize: 12, lineHeight: 17 }}
                >
                  {content.content || content.display_text || content.caption || "(내용 없음)"}
                </Text>
              </View>

              {!!mediaUrl && (
                <Image
                  source={{ uri: getFullImageUrl(mediaUrl) }}
                  style={{ width: 56, height: 56, borderRadius: 8 }}
                  resizeMode="cover"
                />
              )}
            </View>

            <Text style={{ color: colors.textMuted, marginTop: 6, fontSize: 11 }}>
              최근 행위: {content.latest_event_type || "기록 없음"} · IP {content.latest_event_ip || "기록 없음"} · {formattedDate}
            </Text>

            <TouchableOpacity
              onPress={(event) => {
                event.stopPropagation();
                onToggleContentHistory(contentType, content.id);
              }}
              style={styles.historyButton}
            >
              <Ionicons name="time-outline" size={14} color={primaryAccent} />
              <Text style={{ color: primaryAccent, fontSize: 12, fontWeight: "700" }}>
                변경 이력 {content.revision_count || 0}건
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.detailLabel}>
            <Text style={{ color: primaryAccent, fontSize: 11, fontWeight: "700" }}>상세 보기</Text>
            <Ionicons name="chevron-forward" size={15} color={primaryAccent} />
          </View>
        </TouchableOpacity>
        {renderContentHistory(historyKey)}
      </View>
    );
  };

  const renderActivityUser = ({ item }: { item: AdminActivityUser }) => {
    const isExpanded = expandedActivityUserId === item.user_id;
    const hasMore =
      activityContent?.pagination?.posts_has_more || activityContent?.pagination?.comments_has_more;
    const withdrawalLabel =
      item.withdrawal_status === "pending"
        ? "탈퇴 대기"
        : item.withdrawal_status === "finalized"
        ? "최종 탈퇴"
        : item.withdrawal_status === "purged"
        ? "개인정보 파기"
        : "가입 회원";
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => onToggleActivityUser(item)}
        style={[
          styles.activityLogCard,
          { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
        ]}
      >
        <View style={styles.activityUserHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.usernameText, { color: colors.textPrimary }]}>
              {item.username} {item.nickname ? `(${item.nickname})` : ""}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }}>
              최근 활동 {new Date(item.latest_activity_at).toLocaleString()} · 총 {item.activity_count}건
            </Text>
            <Text
              style={{
                color: item.withdrawal_status ? "#ef4444" : "#16a34a",
                fontSize: 11,
                marginTop: 3,
              }}
            >
              {withdrawalLabel}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                onOpenUser360Modal(item);
              }}
              style={{
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 6,
                backgroundColor: `${primaryAccent}18`,
              }}
            >
              <Text style={{ color: primaryAccent, fontSize: 11, fontWeight: "bold" }}>
                360° 모달
              </Text>
            </TouchableOpacity>

            <View style={styles.detailLabel}>
              <Text style={{ color: primaryAccent, fontSize: 11, fontWeight: "700" }}>
                {isExpanded ? "접기" : "콘텐츠 보기"}
              </Text>
              <Ionicons
                name={isExpanded ? "chevron-up" : "chevron-down"}
                size={16}
                color={primaryAccent}
              />
            </View>
          </View>
        </View>
        {isExpanded && (
          <View style={[styles.activityDetail, { borderTopColor: colors.borderColor }]}>
            {activityContentLoading && !activityContent && (
              <ActivityIndicator style={{ marginVertical: 14 }} color={primaryAccent} />
            )}
            {!!activityContent?.account_events?.length && (
              <View style={[styles.accountEvents, { borderColor: colors.borderColor }]}>
                <Text style={{ color: colors.textPrimary, fontWeight: "800", fontSize: 12 }}>
                  가입·탈퇴 기록
                </Text>
                {activityContent.account_events.map((event: any) => (
                  <View key={event.id} style={styles.accountEventRow}>
                    <Text style={{ color: primaryAccent, fontWeight: "700", fontSize: 12 }}>
                      {event.event_type}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                      {new Date(event.created_at).toLocaleString()} · IP {event.ip_address || "기록 없음"}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            {activityContent?.posts?.map((post: any) =>
              renderActivityContentRow(post, "post")
            )}
            {activityContent?.comments?.map((comment: any) =>
              renderActivityContentRow(comment, "comment")
            )}
            {activityContent &&
              !activityContent.posts?.length &&
              !activityContent.comments?.length && (
                <Text style={{ color: colors.textMuted, textAlign: "center", marginVertical: 14 }}>
                  작성한 콘텐츠가 없습니다.
                </Text>
              )}
            {activityContent && hasMore && (
              <TouchableOpacity
                disabled={activityContentLoading}
                onPress={(event) => {
                  event.stopPropagation();
                  onLoadMoreActivityContent(item.user_id);
                }}
                style={[styles.loadMoreButton, { borderColor: primaryAccent }]}
              >
                {activityContentLoading ? (
                  <ActivityIndicator size="small" color={primaryAccent} />
                ) : (
                  <Text style={{ color: primaryAccent, fontWeight: "700" }}>더 보기</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <View style={styles.subnavRow}>
        <TouchableOpacity
          onPress={onSelectUsersTab}
          style={[styles.subnavButton, { borderColor: colors.borderColor }]}
        >
          <Text style={{ color: colors.textSecondary, fontWeight: "700" }}>회원 목록</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.subnavButton,
            { borderColor: primaryAccent, backgroundColor: `${primaryAccent}18` },
          ]}
        >
          <Text style={{ color: primaryAccent, fontWeight: "700" }}>활동·보존 이력</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.activitySearchRow}>
        <View
          style={[
            styles.searchContainer,
            styles.activitySearchContainer,
            { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
          ]}
        >
          <Ionicons name="search" size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            value={activityQuery}
            onChangeText={onChangeActivityQuery}
            placeholder="아이디 또는 닉네임 검색"
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.textPrimary }]}
          />
        </View>
        <TouchableOpacity
          onPress={onSubmitSearch}
          style={[styles.activitySearchButton, { backgroundColor: primaryAccent }]}
        >
          <Text style={{ color: "white", fontWeight: "bold" }}>검색</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={activityUsers}
        keyExtractor={(item) => item.user_id}
        contentContainerStyle={{ paddingTop: 12 }}
        ListEmptyComponent={
          <Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 24 }}>
            표시할 사용자 활동 기록이 없습니다.
          </Text>
        }
        ListFooterComponent={
          activityLoadingMore ? (
            <ActivityIndicator style={{ marginVertical: 14 }} color={primaryAccent} />
          ) : null
        }
        onEndReachedThreshold={0.35}
        onEndReached={onLoadMoreUsers}
        renderItem={renderActivityUser}
      />
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
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 42,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    height: 40,
    paddingVertical: 0,
    textAlignVertical: "center",
  },
  activitySearchRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  activitySearchContainer: { flex: 1, marginBottom: 0 },
  activitySearchButton: {
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  activityLogCard: { padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 10 },
  activityUserHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  detailLabel: { flexDirection: "row", alignItems: "center", gap: 2, marginLeft: 8 },
  activityDetail: { marginTop: 10, paddingTop: 10, borderTopWidth: 1 },
  activityContentRow: {
    marginTop: 10,
    padding: 11,
    borderWidth: 1,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  historyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
    alignSelf: "flex-start",
    minHeight: 28,
  },
  historyPanel: { marginTop: 6, marginLeft: 10, padding: 9, borderWidth: 1, borderRadius: 10 },
  historyRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  accountEvents: { padding: 10, borderWidth: 1, borderRadius: 10, marginBottom: 4 },
  accountEventRow: { marginTop: 7, gap: 2 },
  loadMoreButton: {
    height: 38,
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  usernameText: {
    fontSize: 14,
    fontWeight: "bold",
  },
});
