import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import api from "../services/api";
import { useTheme } from "../context/ThemeContext";

export const CommunityAdminNoticeScreen = ({ navigation }: any) => {
  const { colors } = useTheme();

  const scrollViewRef = useRef<ScrollView>(null);

  const [notices, setNotices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedNoticeIds, setExpandedNoticeIds] = useState<string[]>([]);

  // Form State (Create / Edit)
  const [editingNotice, setEditingNotice] = useState<any | null>(null);
  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeContent, setNoticeContent] = useState("");
  const [isGlobal, setIsGlobal] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadNotices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/community/admin/notices");
      const list = (res.data?.data || []).sort(
        (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setNotices(list);
      if (list.length > 0 && expandedNoticeIds.length === 0) {
        setExpandedNoticeIds([list[0].id]);
      }
    } catch (e: any) {
      Alert.alert("오류", e.response?.data?.detail || "공지사항 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotices();
  }, [loadNotices]);

  const toggleNotice = (noticeId: string) => {
    setExpandedNoticeIds((prev) =>
      prev.includes(noticeId) ? prev.filter((id) => id !== noticeId) : [...prev, noticeId]
    );
  };

  const resetForm = () => {
    setEditingNotice(null);
    setNoticeTitle("");
    setNoticeContent("");
    setIsGlobal(true);
  };

  const startEdit = (notice: any) => {
    setEditingNotice(notice);
    setNoticeTitle(notice.title);
    setNoticeContent(notice.content);
    setIsGlobal(Boolean(notice.is_global));
    if (!expandedNoticeIds.includes(notice.id)) {
      setExpandedNoticeIds((prev) => [...prev, notice.id]);
    }
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    }, 50);
  };

  const handleSaveNotice = async () => {
    if (!noticeTitle.trim() || !noticeContent.trim()) {
      Alert.alert("알림", "공지 제목과 내용을 입력해 주세요.");
      return;
    }

    setSubmitting(true);
    try {
      if (editingNotice) {
        await api.patch(`/community/admin/notices/${editingNotice.id}`, {
          title: noticeTitle.trim(),
          content: noticeContent.trim(),
          is_global: isGlobal,
        });
        Alert.alert("성공", "공지사항이 수정되었습니다.");
      } else {
        await api.post("/community/admin/notices", {
          title: noticeTitle.trim(),
          content: noticeContent.trim(),
          is_global: isGlobal,
        });
        Alert.alert("성공", isGlobal ? "전체 공지가 등록되었습니다." : "일반 공지가 등록되었습니다.");
      }
      resetForm();
      loadNotices();
    } catch (e: any) {
      Alert.alert("오류", e.response?.data?.detail || "공지 저장에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteNotice = (notice: any) => {
    Alert.alert(
      "공지 삭제",
      `‘${notice.title}’ 공지를 삭제할까요?`,
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: async () => {
            try {
              await api.delete(`/community/admin/notices/${notice.id}`);
              Alert.alert("완료", "공지사항이 삭제되었습니다.");
              if (editingNotice?.id === notice.id) {
                resetForm();
              }
              loadNotices();
            } catch (e: any) {
              Alert.alert("오류", e.response?.data?.detail || "공지 삭제에 실패했습니다.");
            }
          },
        },
      ]
    );
  };

  const isNoticeGlobal = (n: any) => Boolean(n.is_global && !n.board_id);

  let globalNotices = notices
    .filter(isNoticeGlobal)
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  let generalNotices = notices
    .filter((n: any) => !isNoticeGlobal(n))
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  if (globalNotices.length === 0 && notices.length > 0) {
    const mainNotice = notices.find((n) => !n.board_id) || notices[0];
    if (mainNotice) {
      globalNotices = [mainNotice];
      generalNotices = notices.filter((n) => n.id !== mainNotice.id);
    }
  }

  const renderNoticeCard = (notice: any, keyPrefix = "item") => {
    const isExpanded = expandedNoticeIds.includes(notice.id);
    const isEditingThis = editingNotice?.id === notice.id;
    const isGlobalNotice = isNoticeGlobal(notice);

    return (
      <View
        key={`${keyPrefix}-${notice.id}`}
        style={[
          styles.noticeCard,
          {
            backgroundColor: colors.bgCard,
            borderColor: isEditingThis ? colors.accentPurple : colors.borderColor,
            borderWidth: isEditingThis ? 2 : 1,
          },
        ]}
      >
        {/* Notice Card Header */}
        <TouchableOpacity
          style={styles.noticeHeaderRow}
          onPress={() => toggleNotice(notice.id)}
          activeOpacity={0.8}
        >
          <Ionicons
            name={isGlobalNotice ? "megaphone-outline" : "notifications-outline"}
            size={18}
            color={isGlobalNotice ? colors.accentPurple : colors.accentBlue}
            style={{ marginRight: 10 }}
          />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View
                style={{
                  backgroundColor: isGlobalNotice ? colors.accentPurple + "20" : colors.accentBlue + "20",
                  paddingHorizontal: 6,
                  paddingVertical: 1,
                  borderRadius: 4,
                }}
              >
                <Text
                  style={{
                    color: isGlobalNotice ? colors.accentPurple : colors.accentBlue,
                    fontSize: 10,
                    fontWeight: "800",
                  }}
                >
                  {isGlobalNotice ? "전체공지" : "일반공지"}
                </Text>
              </View>
              <Text style={[styles.noticeCardTitle, { color: colors.textPrimary, flex: 1 }]} numberOfLines={1}>
                {notice.title}
              </Text>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 3 }}>
              {new Date(notice.created_at).toLocaleString("ko-KR", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          </View>
          {isEditingThis && (
            <Text style={{ color: colors.accentPurple, fontSize: 12, fontWeight: "700", marginRight: 8 }}>
              수정 중...
            </Text>
          )}
          <Ionicons
            name={isExpanded ? "chevron-up" : "chevron-down"}
            size={20}
            color={colors.textSecondary}
          />
        </TouchableOpacity>

        {/* Notice Collapsible Content */}
        {isExpanded && (
          <View style={[styles.noticeBody, { borderTopColor: colors.borderColor }]}>
            <Text style={[styles.noticeContentText, { color: colors.textPrimary }]}>
              {notice.content}
            </Text>

            {/* Action Buttons */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.accentBlue + "15" }]}
                onPress={() => startEdit(notice)}
              >
                <Ionicons name="create-outline" size={15} color={colors.accentBlue} />
                <Text style={[styles.actionBtnText, { color: colors.accentBlue }]}>
                  {isEditingThis ? "상단 양식에서 수정 중" : "수정"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: "#ef444415" }]}
                onPress={() => handleDeleteNotice(notice)}
              >
                <Ionicons name="trash-outline" size={15} color="#ef4444" />
                <Text style={[styles.actionBtnText, { color: "#ef4444" }]}>삭제</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.borderColor }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>공지사항 관리</Text>
        <TouchableOpacity onPress={resetForm} activeOpacity={0.7}>
          <Text style={{ color: colors.accentBlue, fontWeight: "700" }}>새 공지</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={true}
          showsVerticalScrollIndicator={true}
        >
          {/* Form Card */}
          <View
            style={[
              styles.formCard,
              {
                backgroundColor: colors.bgCard,
                borderColor: editingNotice ? colors.accentPurple : colors.borderColor,
                borderWidth: editingNotice ? 2 : 1,
              },
            ]}
          >
            <View style={styles.formHeader}>
              <Ionicons name={editingNotice ? "create-outline" : "add-circle-outline"} size={20} color={colors.accentPurple} />
              <Text style={[styles.formTitle, { color: colors.textPrimary }]}>
                {editingNotice ? "공지사항 수정" : "새 공지사항 작성"}
              </Text>
              {editingNotice && (
                <View style={styles.editingTag}>
                  <Text style={styles.editingTagText}>수정 모드</Text>
                </View>
              )}
            </View>

            {/* Type Selector (Global Notice vs General Notice) */}
            <View style={[styles.switchRow, { borderColor: colors.borderColor, backgroundColor: colors.bgInput }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 13 }}>
                  {isGlobal ? "전체 공지 (커뮤니티 메인 상단 노출)" : "일반 공지 (공지 목록 팝업 노출)"}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                  {isGlobal ? "※ 전체 공지는 최신 1개만 상단에 표시됩니다." : "※ 일반 공지는 우측 상단 공지사항 목록에 노출됩니다."}
                </Text>
              </View>
              <Switch
                value={isGlobal}
                onValueChange={setIsGlobal}
                trackColor={{ false: colors.borderColor, true: colors.accentPurple }}
              />
            </View>

            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderColor, backgroundColor: colors.bgInput }]}
              placeholder="공지 제목"
              placeholderTextColor={colors.textMuted}
              value={noticeTitle}
              onChangeText={setNoticeTitle}
            />
            <TextInput
              style={[styles.input, styles.contentInput, { color: colors.textPrimary, borderColor: colors.borderColor, backgroundColor: colors.bgInput }]}
              placeholder="공지 내용을 입력하세요."
              placeholderTextColor={colors.textMuted}
              value={noticeContent}
              onChangeText={setNoticeContent}
              multiline
              scrollEnabled={false}
            />

            <View style={styles.formBtnRow}>
              {editingNotice && (
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: colors.borderColor }]}
                  onPress={resetForm}
                >
                  <Text style={{ color: colors.textSecondary, fontWeight: "700" }}>취소</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: colors.accentPurple, flex: 1 }]}
                onPress={handleSaveNotice}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveBtnText}>{editingNotice ? "수정 저장" : "공지사항 등록"}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Notices Section Header */}
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>등록된 공지사항 목록</Text>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>총 {notices.length}건</Text>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color={colors.accentPurple} style={{ marginVertical: 30 }} />
          ) : notices.length === 0 ? (
            <View style={[styles.emptyBox, { borderColor: colors.borderColor, backgroundColor: colors.bgCard }]}>
              <Ionicons name="megaphone-outline" size={36} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, marginTop: 8 }}>등록된 공지가 없습니다.</Text>
            </View>
          ) : (
            <>
              {/* 1. 전체 공지 목록 */}
              {globalNotices.length > 0 && (
                <View style={{ marginBottom: 16 }}>
                  <View style={styles.subSectionHeader}>
                    <Ionicons name="megaphone-outline" size={16} color={colors.accentPurple} />
                    <Text style={[styles.subSectionTitle, { color: colors.accentPurple }]}>
                      전체 공지 목록 ({globalNotices.length}건)
                    </Text>
                  </View>
                  {globalNotices.map((notice) => renderNoticeCard(notice, "global"))}
                </View>
              )}

              {/* 2. 일반 공지 목록 */}
              {generalNotices.length > 0 && (
                <View style={{ marginBottom: 16 }}>
                  <View style={styles.subSectionHeader}>
                    <Ionicons name="list-outline" size={16} color={colors.accentBlue} />
                    <Text style={[styles.subSectionTitle, { color: colors.textPrimary }]}>
                      일반 공지 목록 ({generalNotices.length}건)
                    </Text>
                  </View>
                  {generalNotices.map((notice) => renderNoticeCard(notice, "general"))}
                </View>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    height: 54,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 17, fontWeight: "800" },
  content: { padding: 16, paddingBottom: 60 },
  formCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
  },
  formHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  formTitle: { fontSize: 15, fontWeight: "800" },
  editingTag: {
    backgroundColor: "#a855f720",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: "auto",
  },
  editingTagText: {
    color: "#a855f7",
    fontSize: 11,
    fontWeight: "700",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 12,
    marginBottom: 10,
    fontSize: 14,
  },
  contentInput: {
    minHeight: 110,
    textAlignVertical: "top",
    paddingTop: 10,
  },
  formBtnRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  cancelBtn: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  saveBtn: {
    height: 44,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  saveBtnText: { color: "#ffffff", fontWeight: "800", fontSize: 15 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: "800" },
  subSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
    marginTop: 4,
  },
  subSectionTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  emptyBox: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  noticeCard: {
    borderRadius: 14,
    marginBottom: 10,
    overflow: "hidden",
  },
  noticeHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
  },
  noticeCardTitle: { fontSize: 14, fontWeight: "700" },
  noticeBody: {
    borderTopWidth: 1,
    padding: 14,
    paddingTop: 12,
  },
  noticeContentText: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 14,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: "700",
  },
});
