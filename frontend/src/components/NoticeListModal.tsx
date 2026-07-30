import React, { useCallback, useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "../services/api";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { HashtagText } from "./HashtagText";

interface NoticeListModalProps {
  visible: boolean;
  onClose: () => void;
}

export const NoticeListModal: React.FC<NoticeListModalProps> = ({ visible, onClose }) => {
  const { colors } = useTheme();
  const { user } = useAuth();
  const isAdmin = Boolean(user?.is_admin);

  const [notices, setNotices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedNoticeIds, setExpandedNoticeIds] = useState<string[]>([]);

  // Admin Create/Edit Form inside modal
  const [showForm, setShowForm] = useState(false);
  const [editingNotice, setEditingNotice] = useState<any | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isGlobal, setIsGlobal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchNotices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/community/notices?notice_type=all");
      const list = res.data?.data || [];
      setNotices(list);
      // Auto-expand global notice or first notice
      if (list.length > 0 && expandedNoticeIds.length === 0) {
        setExpandedNoticeIds([list[0].id]);
      }
    } catch (err: any) {
      console.log("Error fetching notices", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      fetchNotices();
    }
  }, [visible, fetchNotices]);

  const toggleNotice = (id: string) => {
    setExpandedNoticeIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingNotice(null);
    setTitle("");
    setContent("");
    setIsGlobal(false);
  };

  const handleStartEdit = (notice: any) => {
    setEditingNotice(notice);
    setTitle(notice.title);
    setContent(notice.content);
    setIsGlobal(Boolean(notice.is_global));
    setShowForm(true);
  };

  const handleSaveNotice = async () => {
    if (!title.trim() || !content.trim()) {
      Alert.alert("알림", "공지 제목과 내용을 모두 입력해주세요.");
      return;
    }
    setSubmitting(true);
    try {
      if (editingNotice) {
        await api.patch(`/community/admin/notices/${editingNotice.id}`, {
          title: title.trim(),
          content: content.trim(),
          is_global: isGlobal,
        });
        Alert.alert("성공", "공지사항이 수정되었습니다.");
      } else {
        await api.post("/community/admin/notices", {
          title: title.trim(),
          content: content.trim(),
          is_global: isGlobal,
        });
        Alert.alert("성공", isGlobal ? "전체 공지가 등록되었습니다." : "일반 공지가 등록되었습니다.");
      }
      resetForm();
      fetchNotices();
    } catch (err: any) {
      Alert.alert("오류", err.response?.data?.detail || "공지 저장에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteNotice = (notice: any) => {
    Alert.alert(
      "공지 삭제",
      `‘${notice.title}’ 공지사항을 삭제하시겠습니까?`,
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: async () => {
            try {
              await api.delete(`/community/admin/notices/${notice.id}`);
              Alert.alert("완료", "공지가 삭제되었습니다.");
              fetchNotices();
            } catch (err: any) {
              Alert.alert("오류", err.response?.data?.detail || "공지 삭제에 실패했습니다.");
            }
          },
        },
      ]
    );
  };

  const globalNotices = notices.filter((n) => n.is_global);
  const generalNotices = notices.filter((n) => !n.is_global);

  const renderNoticeItem = (notice: any) => {
    const isExpanded = expandedNoticeIds.includes(notice.id);
    const isGlobalNotice = Boolean(notice.is_global);

    return (
      <View
        key={notice.id}
        style={[
          styles.noticeCard,
          {
            backgroundColor: isGlobalNotice ? colors.accentPurple + "0d" : colors.bgCard,
            borderColor: isGlobalNotice ? colors.accentPurple : colors.borderColor,
            borderWidth: isGlobalNotice ? 2 : 1,
          },
        ]}
      >
        {/* Header Row */}
        <TouchableOpacity
          style={styles.noticeHeaderRow}
          onPress={() => toggleNotice(notice.id)}
          activeOpacity={0.8}
        >
          <Ionicons
            name={isGlobalNotice ? "megaphone" : "sparkles-outline"}
            size={17}
            color={isGlobalNotice ? colors.accentPurple : colors.accentBlue}
            style={{ marginRight: 8 }}
          />
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View
              style={{
                backgroundColor: isGlobalNotice ? colors.accentPurple : colors.accentBlue + "20",
                paddingHorizontal: 7,
                paddingVertical: 2,
                borderRadius: 5,
              }}
            >
              <Text
                style={{
                  color: isGlobalNotice ? "#ffffff" : colors.accentBlue,
                  fontSize: 10,
                  fontWeight: "800",
                }}
              >
                {isGlobalNotice ? "📌 전체공지" : "📋 일반공지"}
              </Text>
            </View>
            <Text style={[styles.noticeTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {notice.title}
            </Text>
          </View>
          <Ionicons
            name={isExpanded ? "chevron-up" : "chevron-down"}
            size={18}
            color={colors.textSecondary}
            style={{ marginLeft: 8 }}
          />
        </TouchableOpacity>

        {/* Downward Expanded Content */}
        {isExpanded ? (
          <View style={[styles.noticeBody, { borderTopColor: colors.borderLight }]}>
            <HashtagText text={notice.content} style={styles.noticeBodyText} />
            <Text style={[styles.dateText, { color: colors.textMuted }]}>
              {new Date(notice.created_at).toLocaleString("ko-KR", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>

            {/* Admin Action Buttons */}
            {isAdmin && (
              <View style={styles.adminActionRow}>
                <TouchableOpacity
                  style={[styles.adminActionBtn, { backgroundColor: colors.accentBlue + "15" }]}
                  onPress={() => handleStartEdit(notice)}
                >
                  <Ionicons name="create-outline" size={14} color={colors.accentBlue} />
                  <Text style={[styles.adminActionText, { color: colors.accentBlue }]}>수정</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.adminActionBtn, { backgroundColor: "#ef444415" }]}
                  onPress={() => handleDeleteNotice(notice)}
                >
                  <Ionicons name="trash-outline" size={14} color="#ef4444" />
                  <Text style={[styles.adminActionText, { color: "#ef4444" }]}>삭제</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          <Text style={[styles.snippetText, { color: colors.textMuted }]} numberOfLines={1}>
            {notice.content.replace(/<[^>]+>/g, "")}
          </Text>
        )}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.modalCard, { backgroundColor: colors.bgPrimary, borderColor: colors.borderColor }]}>
          {/* Header */}
          <View style={[styles.modalHeader, { borderBottomColor: colors.borderLight }]}>
            <View style={styles.headerTitleGroup}>
              <Ionicons name="megaphone-outline" size={22} color={colors.accentPurple} />
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>공지사항 목록</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              {isAdmin && !showForm && (
                <TouchableOpacity
                  style={[styles.addBtn, { backgroundColor: colors.accentPurple }]}
                  onPress={() => {
                    resetForm();
                    setShowForm(true);
                  }}
                >
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={styles.addBtnText}>공지 작성</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Admin Form Card */}
          {showForm && (
            <View style={[styles.formContainer, { backgroundColor: colors.bgCard, borderColor: colors.accentPurple }]}>
              <Text style={[styles.formTitle, { color: colors.textPrimary }]}>
                {editingNotice ? "공지사항 수정" : "새 공지사항 작성"}
              </Text>
              
              <View style={[styles.switchRow, { borderColor: colors.borderColor, backgroundColor: colors.bgInput }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 13 }}>
                    {isGlobal ? "📌 전체 공지 (상단 고정 - 1개 제한)" : "📋 일반 공지 (목록 노출)"}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                    {isGlobal ? "※ 전체 공지는 항상 최상단에 고정 표시됩니다." : "※ 일반 공지는 작성일 순으로 아래에 표시됩니다."}
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
                value={title}
                onChangeText={setTitle}
              />
              <TextInput
                style={[styles.input, styles.contentInput, { color: colors.textPrimary, borderColor: colors.borderColor, backgroundColor: colors.bgInput }]}
                placeholder="공지 내용을 입력하세요"
                placeholderTextColor={colors.textMuted}
                value={content}
                onChangeText={setContent}
                multiline
              />
              <View style={styles.formBtnRow}>
                <TouchableOpacity style={[styles.cancelFormBtn, { borderColor: colors.borderColor }]} onPress={resetForm}>
                  <Text style={{ color: colors.textSecondary, fontWeight: "700" }}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveFormBtn, { backgroundColor: colors.accentPurple }]}
                  onPress={handleSaveNotice}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.saveFormBtnText}>{editingNotice ? "수정 완료" : "등록 완료"}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Notice List Scroll */}
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={true}>
            {loading ? (
              <ActivityIndicator size="large" color={colors.accentPurple} style={{ marginVertical: 30 }} />
            ) : notices.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="notifications-off-outline" size={40} color={colors.textMuted} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>등록된 공지사항이 없습니다.</Text>
              </View>
            ) : (
              <>
                {/* 1. 全體 (Global) Notices Section - Always Top Priority */}
                {globalNotices.length > 0 && (
                  <View style={styles.sectionContainer}>
                    <View style={styles.sectionTitleRow}>
                      <Ionicons name="megaphone" size={16} color={colors.accentPurple} />
                      <Text style={[styles.sectionTitleText, { color: colors.accentPurple }]}>
                        전체 공지 (상단 고정)
                      </Text>
                    </View>
                    {globalNotices.map(renderNoticeItem)}
                  </View>
                )}

                {/* 2. 一般 (General) Notices Section */}
                {generalNotices.length > 0 && (
                  <View style={styles.sectionContainer}>
                    {globalNotices.length > 0 && (
                      <View style={styles.sectionTitleRow}>
                        <Ionicons name="list-outline" size={16} color={colors.accentBlue} />
                        <Text style={[styles.sectionTitleText, { color: colors.textPrimary }]}>
                          일반 공지 목록
                        </Text>
                      </View>
                    )}
                    {generalNotices.map(renderNoticeItem)}
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalCard: {
    height: "85%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    overflow: "hidden",
  },
  modalHeader: {
    height: 58,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 4,
  },
  addBtnText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },
  closeBtn: {
    padding: 4,
  },
  formContainer: {
    padding: 14,
    margin: 16,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  formTitle: {
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 10,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    height: 40,
    paddingHorizontal: 10,
    marginBottom: 8,
    fontSize: 13,
  },
  contentInput: {
    height: 80,
    textAlignVertical: "top",
    paddingTop: 8,
  },
  formBtnRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 4,
  },
  cancelFormBtn: {
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  saveFormBtn: {
    paddingHorizontal: 16,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  saveFormBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 13,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionContainer: {
    marginBottom: 14,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  sectionTitleText: {
    fontSize: 14,
    fontWeight: "800",
  },
  emptyBox: {
    paddingVertical: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    marginTop: 10,
    fontSize: 14,
  },
  noticeCard: {
    borderWidth: 1,
    borderRadius: 14,
    marginBottom: 10,
    overflow: "hidden",
  },
  noticeHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
  },
  noticeTitle: {
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
  },
  snippetText: {
    fontSize: 12,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  noticeBody: {
    borderTopWidth: 1,
    padding: 14,
    paddingTop: 12,
  },
  noticeBodyText: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 8,
  },
  dateText: {
    fontSize: 11,
    marginTop: 4,
  },
  adminActionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 12,
  },
  adminActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  adminActionText: {
    fontSize: 12,
    fontWeight: "700",
  },
});
