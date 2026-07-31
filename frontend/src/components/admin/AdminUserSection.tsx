import React from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../theme/colors";
import { AdminUserItem } from "../../services/adminService";
import { getDisplayName } from "../../utils/displayName";
import { AdminAvatar, AdminBadge } from "../AdminIdentity";

export interface AdminUserSectionProps {
  users: AdminUserItem[];
  searchQuery: string;
  totalUsers: number;
  loading: boolean;
  refreshing: boolean;
  colors: ThemeColors;
  primaryAccent: string;
  onChangeSearchQuery: (query: string) => void;
  onClearSearchQuery: () => void;
  onSelectActivityTab: () => void;
  onRefresh: () => void;
  onSelectUser: (user: AdminUserItem) => void;
  onToggleUserActive: (user: AdminUserItem) => void;
}

export const AdminUserSection: React.FC<AdminUserSectionProps> = ({
  users,
  searchQuery,
  totalUsers,
  loading,
  refreshing,
  colors,
  primaryAccent,
  onChangeSearchQuery,
  onClearSearchQuery,
  onSelectActivityTab,
  onRefresh,
  onSelectUser,
  onToggleUserActive,
}) => {
  return (
    <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 12 }}>
      <View style={styles.subnavRow}>
        <TouchableOpacity
          style={[
            styles.subnavButton,
            { borderColor: primaryAccent, backgroundColor: `${primaryAccent}18` },
          ]}
        >
          <Text style={{ color: primaryAccent, fontWeight: "700" }}>회원 목록</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onSelectActivityTab}
          style={[styles.subnavButton, { borderColor: colors.borderColor }]}
        >
          <Text style={{ color: colors.textSecondary, fontWeight: "700" }}>
            활동·보존 이력
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search Box */}
      <View
        style={[
          styles.searchContainer,
          { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
        ]}
      >
        <Ionicons name="search" size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
        <TextInput
          style={[styles.searchInput, { color: colors.textPrimary }]}
          placeholder="사용자명 또는 이름 검색..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={onChangeSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={onClearSearchQuery}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <Text style={[styles.countText, { color: colors.textMuted }]}>
        총 {totalUsers}명의 회원 검색됨
      </Text>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} size="large" color={primaryAccent} />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={primaryAccent}
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.userCard,
                { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
              ]}
              activeOpacity={0.8}
              onPress={() => onSelectUser(item)}
            >
              <AdminAvatar user={item} style={styles.userAvatar} />

              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={[styles.usernameText, { color: colors.textPrimary }]}>
                    {getDisplayName(item)}
                  </Text>
                  {item.is_admin && <AdminBadge />}
                </View>
                <Text style={[styles.fullNameText, { color: colors.textMuted }]}>
                  {item.full_name}
                </Text>
                <Text style={[styles.emailText, { color: colors.textMuted }]}>
                  {item.email}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    marginTop: 4,
                    flexWrap: "wrap",
                  }}
                >
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: "rgba(168, 85, 247, 0.12)" },
                    ]}
                  >
                    <Text style={{ color: primaryAccent, fontSize: 11, fontWeight: "bold" }}>
                      🖼️ 게시물 {item.posts_count ?? 0}개
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: "rgba(59, 130, 246, 0.12)" },
                    ]}
                  >
                    <Text style={{ color: "#3b82f6", fontSize: 11, fontWeight: "bold" }}>
                      💬 댓글 {item.comments_count ?? 0}개
                    </Text>
                  </View>
                </View>
                {item.withdrawal_status === "pending" && item.withdrawal_cancelable_until && (
                  <Text style={[styles.emailText, { color: "#f59e0b" }]}>
                    취소 가능: {new Date(item.withdrawal_cancelable_until).toLocaleString("ko-KR")}
                  </Text>
                )}
                {item.withdrawal_status === "finalized" && item.personal_data_retention_until && (
                  <Text style={[styles.emailText, { color: colors.textMuted }]}>
                    개인정보 파기 예정:{" "}
                    {new Date(item.personal_data_retention_until).toLocaleString("ko-KR")}
                  </Text>
                )}
                {item.personal_data_legal_hold && (
                  <Text style={[styles.emailText, { color: "#ef4444" }]}>
                    적법한 보존 요청 적용 중
                  </Text>
                )}
              </View>

              <View style={{ alignItems: "flex-end" }}>
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor:
                        item.withdrawal_status === "pending"
                          ? "rgba(245, 158, 11, 0.15)"
                          : item.is_active
                            ? "rgba(34, 197, 94, 0.15)"
                            : "rgba(239, 68, 68, 0.15)",
                    },
                  ]}
                >
                  <Text
                    style={{
                      color:
                        item.withdrawal_status === "pending"
                          ? "#f59e0b"
                          : item.is_active
                            ? "#22c55e"
                            : "#ef4444",
                      fontSize: 11,
                      fontWeight: "bold",
                    }}
                  >
                    {item.withdrawal_status === "pending"
                      ? "탈퇴 대기"
                      : item.withdrawal_status === "finalized"
                        ? "최종 탈퇴"
                        : item.withdrawal_status === "purged"
                          ? "개인정보 파기"
                          : item.is_active
                            ? "정상"
                            : "정지"}
                  </Text>
                </View>

                {!item.is_admin && !item.withdrawal_status && (
                  <TouchableOpacity
                    style={[
                      styles.toggleBtn,
                      {
                        borderColor: item.is_active ? "#ef4444" : "#22c55e",
                        backgroundColor: item.is_active
                          ? "rgba(239, 68, 68, 0.1)"
                          : "rgba(34, 197, 94, 0.1)",
                      },
                    ]}
                    onPress={() => onToggleUserActive(item)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={{
                        color: item.is_active ? "#ef4444" : "#22c55e",
                        fontSize: 12,
                        fontWeight: "600",
                      }}
                    >
                      {item.is_active ? "정지하기" : "해제하기"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
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
  countText: {
    fontSize: 13,
    marginBottom: 12,
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  usernameText: {
    fontSize: 15,
    fontWeight: "bold",
  },
  fullNameText: {
    fontSize: 13,
    marginTop: 2,
  },
  emailText: {
    fontSize: 11,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
  },
  toggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
});
