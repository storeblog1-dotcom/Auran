import React from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../theme/colors";

export interface AdminCommunitySectionProps {
  colors: ThemeColors;
  primaryAccent: string;
  onCreateBoard: () => void;
  onManageBoards: () => void;
  onManageNotices: () => void;
}

export const AdminCommunitySection: React.FC<AdminCommunitySectionProps> = ({
  colors,
  primaryAccent,
  onCreateBoard,
  onManageBoards,
  onManageNotices,
}) => {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 2 }]}>
        커뮤니티 관리
      </Text>
      <Text style={{ color: colors.textSecondary, lineHeight: 20 }}>
        게시판과 공지를 한 곳에서 관리합니다. 생성과 수정은 아래 항목을 선택해 바로 진행할 수 있습니다.
      </Text>
      <TouchableOpacity
        style={[styles.managementCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}
        onPress={onCreateBoard}
      >
        <View style={[styles.managementIcon, { backgroundColor: `${primaryAccent}18` }]}>
          <Ionicons name="add-circle-outline" size={25} color={primaryAccent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, fontWeight: "800", fontSize: 15 }}>
            게시판 생성
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
            새 상위·하위 게시판을 추가합니다.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.managementCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}
        onPress={onManageBoards}
      >
        <View style={[styles.managementIcon, { backgroundColor: "rgba(6,182,212,0.14)" }]}>
          <Ionicons name="create-outline" size={25} color="#06b6d4" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, fontWeight: "800", fontSize: 15 }}>
            게시판 수정·정렬
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
            목록에서 게시판을 선택해 이름, 공개 방식, 순서를 바꿉니다.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.managementCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}
        onPress={onManageNotices}
      >
        <View style={[styles.managementIcon, { backgroundColor: "rgba(245,158,11,0.14)" }]}>
          <Ionicons name="megaphone-outline" size={25} color="#f59e0b" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, fontWeight: "800", fontSize: 15 }}>
            전체 공지 관리
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
            전체 공지 목록 조회, 펼침/접힘, 수정, 삭제 및 새 공지를 관리합니다.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 16,
  },
  managementCard: {
    minHeight: 88,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  managementIcon: {
    width: 46,
    height: 46,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
});
