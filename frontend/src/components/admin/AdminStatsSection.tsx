import React from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../theme/colors";
import { AdminStats } from "../../services/adminService";

export interface AdminStatsSectionProps {
  stats: AdminStats | null;
  refreshing: boolean;
  colors: ThemeColors;
  primaryAccent: string;
  onRefresh: () => void;
}

export const AdminStatsSection: React.FC<AdminStatsSectionProps> = ({
  stats,
  refreshing,
  colors,
  primaryAccent,
  onRefresh,
}) => {
  return (
    <ScrollView
      style={{ flex: 1, padding: 16 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={primaryAccent}
        />
      }
    >
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
        📊 서비스 핵심 지표 통계
      </Text>

      <View style={styles.statsGrid}>
        <View
          style={[
            styles.statCard,
            { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
          ]}
        >
          <View style={styles.statIconBadge}>
            <Ionicons name="people" size={22} color="#a855f7" />
          </View>
          <Text style={[styles.statValue, { color: colors.textPrimary }]}>
            {stats?.total_users ?? "-"}
          </Text>
          <Text style={[styles.statTitle, { color: colors.textMuted }]}>
            전체 사용자
          </Text>
        </View>

        <View
          style={[
            styles.statCard,
            { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
          ]}
        >
          <View
            style={[
              styles.statIconBadge,
              { backgroundColor: "rgba(34, 197, 94, 0.15)" },
            ]}
          >
            <Ionicons name="checkmark-circle" size={22} color="#22c55e" />
          </View>
          <Text style={[styles.statValue, { color: colors.textPrimary }]}>
            {stats?.active_users ?? "-"}
          </Text>
          <Text style={[styles.statTitle, { color: colors.textMuted }]}>
            활성 계정
          </Text>
        </View>

        <View
          style={[
            styles.statCard,
            { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
          ]}
        >
          <View
            style={[
              styles.statIconBadge,
              { backgroundColor: "rgba(6, 182, 212, 0.15)" },
            ]}
          >
            <Ionicons name="images" size={22} color="#06b6d4" />
          </View>
          <Text style={[styles.statValue, { color: colors.textPrimary }]}>
            {stats?.total_posts ?? "-"}
          </Text>
          <Text style={[styles.statTitle, { color: colors.textMuted }]}>
            총 게시글
          </Text>
        </View>

        <View
          style={[
            styles.statCard,
            { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
          ]}
        >
          <View
            style={[
              styles.statIconBadge,
              { backgroundColor: "rgba(236, 72, 153, 0.15)" },
            ]}
          >
            <Ionicons name="chatbubbles" size={22} color="#ec4899" />
          </View>
          <Text style={[styles.statValue, { color: colors.textPrimary }]}>
            {stats?.total_comments ?? "-"}
          </Text>
          <Text style={[styles.statTitle, { color: colors.textMuted }]}>
            총 댓글
          </Text>
        </View>

        <View
          style={[
            styles.statCard,
            { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
          ]}
        >
          <View
            style={[
              styles.statIconBadge,
              { backgroundColor: "rgba(245, 158, 11, 0.15)" },
            ]}
          >
            <Ionicons name="flash" size={22} color="#f59e0b" />
          </View>
          <Text style={[styles.statValue, { color: colors.textPrimary }]}>
            {stats?.total_stories ?? "-"}
          </Text>
          <Text style={[styles.statTitle, { color: colors.textMuted }]}>
            등록된 스토리
          </Text>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  statCard: {
    width: "48%",
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
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
  statValue: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 2,
  },
  statTitle: {
    fontSize: 12,
  },
});
