import React from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../theme/colors";
import { AdminReportGroup } from "../../services/adminService";

export interface AdminReportSectionProps {
  reports: AdminReportGroup[];
  reportStatus: string;
  loading: boolean;
  refreshing: boolean;
  colors: ThemeColors;
  primaryAccent: string;
  onChangeReportStatus: (status: string) => void;
  onSelectFeedScope: () => void;
  onSelectCommunityScope: () => void;
  onRefresh: () => void;
  onSelectReport: (report: AdminReportGroup) => void;
}

export const AdminReportSection: React.FC<AdminReportSectionProps> = ({
  reports,
  reportStatus,
  loading,
  refreshing,
  colors,
  primaryAccent,
  onChangeReportStatus,
  onSelectFeedScope,
  onSelectCommunityScope,
  onRefresh,
  onSelectReport,
}) => {
  return (
    <View style={{ flex: 1, padding: 16 }}>
      <View style={styles.subnavRow}>
        <TouchableOpacity
          onPress={onSelectFeedScope}
          style={[styles.subnavButton, { borderColor: colors.borderColor }]}
        >
          <Text style={{ color: colors.textSecondary, fontWeight: "700" }}>피드</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onSelectCommunityScope}
          style={[styles.subnavButton, { borderColor: colors.borderColor }]}
        >
          <Text style={{ color: colors.textSecondary, fontWeight: "700" }}>게시판</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.subnavButton,
            { borderColor: primaryAccent, backgroundColor: `${primaryAccent}18` },
          ]}
        >
          <Text style={{ color: primaryAccent, fontWeight: "700" }}>신고됨</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ gap: 8, paddingBottom: 12 }}
      >
        {[
          ["", "전체"],
          ["received", "접수"],
          ["reviewing", "검토 중"],
          ["resolved", "조치 완료"],
          ["rejected", "기각"],
        ].map(([value, label]) => (
          <TouchableOpacity
            key={value}
            onPress={() => onChangeReportStatus(value)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 9,
              borderRadius: 18,
              backgroundColor: reportStatus === value ? primaryAccent : colors.bgCard,
              borderWidth: 1,
              borderColor: reportStatus === value ? primaryAccent : colors.borderColor,
            }}
          >
            <Text
              style={{
                color: reportStatus === value ? "#fff" : colors.textPrimary,
                fontWeight: "700",
              }}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={primaryAccent} />
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(item) => `${item.target_type}:${item.target_id}`}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={primaryAccent}
            />
          }
          ListEmptyComponent={
            <Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 28 }}>
              접수된 신고가 없습니다.
            </Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => onSelectReport(item)}
              style={[
                styles.userCard,
                {
                  backgroundColor: colors.bgCard,
                  borderColor: item.priority ? "#ef4444" : colors.borderColor,
                },
              ]}
            >
              <View
                style={[
                  styles.statIconBadge,
                  {
                    marginBottom: 0,
                    backgroundColor: item.priority
                      ? "rgba(239,68,68,0.12)"
                      : "rgba(124,58,237,0.12)",
                  },
                ]}
              >
                <Ionicons
                  name={
                    item.target_type === "profile"
                      ? "person-outline"
                      : item.target_type === "comment"
                        ? "chatbubble-outline"
                        : "document-text-outline"
                  }
                  size={21}
                  color={item.priority ? "#ef4444" : primaryAccent}
                />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: colors.textPrimary, fontWeight: "800" }}>
                  {item.target_type === "post"
                    ? "게시물"
                    : item.target_type === "comment"
                      ? "댓글·대댓글"
                      : "프로필"}{" "}
                  · 신고 {item.report_count}건
                </Text>
                <Text
                  numberOfLines={2}
                  style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}
                >
                  {item.snapshot.title ||
                    item.snapshot.comment_content ||
                    item.snapshot.caption ||
                    item.snapshot.bio ||
                    "(내용 없음)"}
                </Text>
                <Text style={{ color: primaryAccent, fontSize: 11, marginTop: 5 }}>
                  {item.status} · {new Date(item.latest_at).toLocaleString("ko-KR")}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          )}
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
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  statIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(168, 85, 247, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
});
