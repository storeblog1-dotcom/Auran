import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { getFullImageUrl } from "../config";
import { useTheme } from "../context/ThemeContext";
import {
  adminService,
  AdminContentRevision,
} from "../services/adminService";


interface Props {
  visible: boolean;
  revisionId: string | null;
  onClose: () => void;
}


export const AdminContentRevisionModal = ({
  visible,
  revisionId,
  onClose,
}: Props) => {
  const { colors } = useTheme();
  const [revision, setRevision] = useState<AdminContentRevision | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!visible || !revisionId) {
      setRevision(null);
      setFailed(false);
      return;
    }
    let active = true;
    setLoading(true);
    setFailed(false);
    adminService.getContentRevision(revisionId)
      .then((data) => {
        if (active) setRevision(data);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [visible, revisionId]);

  const body = revision?.kind === "comment"
    ? revision.content
    : revision?.caption;

  const toggleLegalHold = () => {
    if (!revision) return;
    const enabled = !revision.legal_hold;
    Alert.alert(
      enabled ? "법적 보존 설정" : "법적 보존 해제",
      enabled
        ? "이 콘텐츠와 연결 이력을 자동 파기 대상에서 제외하시겠습니까?"
        : "법적 보존을 해제하면 보존기한이 지난 기록은 다음 정리 때 파기됩니다.",
      [
        { text: "취소", style: "cancel" },
        {
          text: enabled ? "설정" : "해제",
          style: enabled ? "default" : "destructive",
          onPress: async () => {
            try {
              await adminService.setContentRevisionLegalHold(revision.revision_id, enabled);
              setRevision({ ...revision, legal_hold: enabled });
            } catch {
              Alert.alert("오류", "법적 보존 상태를 변경하지 못했습니다.");
            }
          },
        },
      ],
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
        <View style={[styles.header, { borderBottomColor: colors.borderColor }]}>
          <View>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>보존 콘텐츠</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              감사 이벤트 당시 상태
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={25} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {loading && <ActivityIndicator style={styles.centered} size="large" color="#7c3aed" />}
        {failed && (
          <Text style={[styles.centeredText, { color: colors.textMuted }]}>
            보존 콘텐츠를 불러오지 못했습니다.
          </Text>
        )}
        {revision && (
          <ScrollView contentContainerStyle={styles.content}>
            <View style={[styles.metaCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
              <Text style={[styles.number, { color: "#7c3aed" }]}>
                {revision.content_number || "고유번호 없음"}
              </Text>
              <Text style={{ color: colors.textPrimary, marginTop: 4 }}>
                [{revision.kind === "post" ? (revision.board_label || "게시물") : (revision.content_type || "댓글")}]{" "}
                {revision.lifecycle_event} · 버전 {revision.version}
              </Text>
              <Text style={{ color: colors.textMuted, marginTop: 4 }}>
                {revision.author.username}
                {revision.author.nickname ? ` (${revision.author.nickname})` : ""}
              </Text>
              <Text style={{ color: colors.textMuted, marginTop: 2 }}>
                IP: {revision.event_ip || "기록 없음"}
              </Text>
              <Text style={{ color: colors.textMuted, marginTop: 2 }}>
                보존기한: {new Date(revision.retention_until).toLocaleString()}
                {revision.legal_hold ? " · 법적 보존 중" : ""}
              </Text>
              <TouchableOpacity
                onPress={toggleLegalHold}
                style={[
                  styles.holdButton,
                  {
                    borderColor: revision.legal_hold ? "#dc2626" : "#7c3aed",
                  },
                ]}
              >
                <Text style={{ color: revision.legal_hold ? "#dc2626" : "#7c3aed", fontWeight: "800" }}>
                  {revision.legal_hold ? "법적 보존 해제" : "법적 보존 설정"}
                </Text>
              </TouchableOpacity>
            </View>

            {revision.kind === "comment" && revision.post && (
              <View style={[styles.section, { borderBottomColor: colors.borderColor }]}>
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>원 게시물</Text>
                <Text style={{ color: "#7c3aed", fontWeight: "700" }}>
                  [{revision.post.board_label || "게시물"}] {revision.post.content_number}
                </Text>
                <Text style={{ color: colors.textPrimary, marginTop: 5 }}>
                  {revision.post.title || revision.post.caption || "(내용 없음)"}
                </Text>
              </View>
            )}

            {!!revision.media?.length && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mediaRow}>
                {revision.media.map((media, index) => (
                  <Image
                    key={`${media.media_url}-${index}`}
                    source={{ uri: getFullImageUrl(media.media_url) }}
                    style={styles.media}
                    resizeMode="cover"
                  />
                ))}
              </ScrollView>
            )}

            <View style={[styles.section, { borderBottomColor: colors.borderColor }]}>
              {!!revision.title && (
                <Text style={[styles.title, { color: colors.textPrimary }]}>{revision.title}</Text>
              )}
              <Text style={[styles.body, { color: colors.textPrimary }]}>
                {body || "(내용 없음)"}
              </Text>
            </View>

            {!!revision.comments?.length && (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                  당시 댓글·답글
                </Text>
                {revision.comments.map((comment) => (
                  <View key={comment.id} style={[styles.comment, { borderColor: colors.borderColor }]}>
                    <Text style={{ color: "#7c3aed", fontSize: 12, fontWeight: "700" }}>
                      [{comment.content_type}] {comment.content_number}
                    </Text>
                    <Text style={{ color: colors.textPrimary, marginTop: 4 }}>{comment.content}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>
                      {comment.lifecycle_event} · IP {comment.event_ip || "기록 없음"}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
};


const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    minHeight: 58,
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { fontSize: 18, fontWeight: "800" },
  closeButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  centered: { flex: 1 },
  centeredText: { textAlign: "center", marginTop: 60 },
  content: { padding: 16, paddingBottom: 40 },
  metaCard: { borderWidth: 1, borderRadius: 14, padding: 13 },
  number: { fontWeight: "800", fontSize: 14 },
  holdButton: {
    minHeight: 38,
    borderWidth: 1,
    borderRadius: 9,
    marginTop: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  mediaRow: { marginTop: 14 },
  media: { width: 220, height: 220, borderRadius: 12, marginRight: 10, backgroundColor: "#ddd" },
  section: { paddingVertical: 16, borderBottomWidth: 1 },
  sectionLabel: { fontSize: 12, fontWeight: "700", marginBottom: 8 },
  title: { fontSize: 18, fontWeight: "800", marginBottom: 8 },
  body: { fontSize: 15, lineHeight: 22 },
  comment: { borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 8 },
});
