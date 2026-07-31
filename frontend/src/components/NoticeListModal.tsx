import React, { useCallback, useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { HashtagText } from "./HashtagText";

import { communityService } from "../services/communityService";

interface NoticeListModalProps {
  visible: boolean;
  onClose: () => void;
}

export const NoticeListModal: React.FC<NoticeListModalProps> = ({ visible, onClose }) => {
  const { colors } = useTheme();

  const [notices, setNotices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedNoticeIds, setExpandedNoticeIds] = useState<string[]>([]);

  const fetchNotices = useCallback(async () => {
    setLoading(true);
    try {
      const list = await communityService.getAllNotices();
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

  const isNoticeGlobal = (n: any) => Boolean(n.is_global && !n.board_id);

  let globalNotices = notices
    .filter(isNoticeGlobal)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  let generalNotices = notices
    .filter((n) => !isNoticeGlobal(n))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Fallback: If DB is_global flag is not set yet, set the 1st main notice as Global Notice
  if (globalNotices.length === 0 && notices.length > 0) {
    const mainNotice = notices.find((n) => !n.board_id) || notices[0];
    if (mainNotice) {
      globalNotices = [mainNotice];
      generalNotices = notices.filter((n) => n.id !== mainNotice.id);
    }
  }

  const renderNoticeItem = (notice: any, keyPrefix = "item") => {
    const isExpanded = expandedNoticeIds.includes(notice.id);
    const isGlobalNotice = isNoticeGlobal(notice);

    return (
      <View
        key={`${keyPrefix}-${notice.id}`}
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
            name={isGlobalNotice ? "megaphone" : "notifications-outline"}
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
                {isGlobalNotice ? "전체공지" : "일반공지"}
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
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

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
                {/* 1. 전체 (Global) Notices Section - Always Top Priority */}
                {globalNotices.length > 0 && (
                  <View style={styles.sectionContainer}>
                    <View style={styles.sectionTitleRow}>
                      <Ionicons name="megaphone-outline" size={16} color={colors.accentPurple} />
                      <Text style={[styles.sectionTitleText, { color: colors.accentPurple }]}>
                        전체 공지 목록
                      </Text>
                    </View>
                    {globalNotices.map((n) => renderNoticeItem(n, "global"))}
                  </View>
                )}

                {/* 2. 일반 (General) Notices Section */}
                {generalNotices.length > 0 && (
                  <View style={styles.sectionContainer}>
                    <View style={styles.sectionTitleRow}>
                      <Ionicons name="list-outline" size={16} color={colors.accentBlue} />
                      <Text style={[styles.sectionTitleText, { color: colors.textPrimary }]}>
                        일반 공지 목록
                      </Text>
                    </View>
                    {generalNotices.map((n) => renderNoticeItem(n, "general"))}
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
    height: "82%",
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
  closeBtn: {
    padding: 4,
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
});
