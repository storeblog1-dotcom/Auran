import React, { useState } from "react";
import { Modal, Share, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";

interface Props {
  visible: boolean;
  post: any | null;
  isMine: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onVisibility?: (visibility: "public" | "followers" | "private") => void;
  onProfile?: () => void;
  onFollow?: () => void;
  onHide?: () => void;
  onBlock?: () => void;
  onReport?: () => void;
  onDelete?: () => void;
}

export const PostOptionsSheet = ({
  visible, post, isMine, onClose, onEdit, onVisibility, onProfile, onFollow, onHide, onBlock, onReport, onDelete,
}: Props) => {
  const { colors } = useTheme();
  const [mode, setMode] = useState<"menu" | "visibility" | "delete">("menu");
  const close = () => { setMode("menu"); onClose(); };
  const action = (callback?: () => void) => { setMode("menu"); onClose(); callback?.(); };
  const row = (icon: any, label: string, callback?: () => void, danger = false) => (
    <TouchableOpacity style={[styles.row, { borderBottomColor: colors.borderColor }]} onPress={() => action(callback)}>
      <View style={[styles.icon, { backgroundColor: danger ? "#fee2e2" : colors.bgInput }]}>
        <Ionicons name={icon} size={20} color={danger ? "#ef4444" : colors.textPrimary} />
      </View>
      <Text style={[styles.label, { color: danger ? "#ef4444" : colors.textPrimary }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.overlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={close} />
        <View style={[styles.sheet, { backgroundColor: colors.bgCard }]}>
          <View style={[styles.handle, { backgroundColor: colors.borderColor }]} />
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {mode === "visibility" ? "공개 범위" : mode === "delete" ? "게시물 삭제" : isMine ? "내 게시물" : `@${post?.user?.username || ""}`}
          </Text>
          {mode === "visibility" ? (
            <>
              {(["public", "followers", "private"] as const).map((value) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.row, { borderBottomColor: colors.borderColor }]}
                  onPress={() => action(() => onVisibility?.(value))}
                >
                  <Ionicons name={value === "public" ? "globe-outline" : value === "followers" ? "people-outline" : "lock-closed-outline"} size={22} color="#7c3aed" />
                  <Text style={[styles.label, { color: colors.textPrimary, marginLeft: 14 }]}>
                    {value === "public" ? "전체 공개" : value === "followers" ? "팔로워 공개" : "비공개"}
                  </Text>
                  {post?.visibility === value && <Ionicons name="checkmark-circle" size={22} color="#7c3aed" />}
                </TouchableOpacity>
              ))}
            </>
          ) : mode === "delete" ? (
            <View style={styles.confirm}>
              <Text style={[styles.confirmText, { color: colors.textPrimary }]}>삭제한 게시물은 일반 화면에서 복구할 수 없습니다.</Text>
              <TouchableOpacity style={styles.deleteButton} onPress={() => action(onDelete)}>
                <Text style={styles.deleteText}>게시물 삭제</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setMode("menu")}>
                <Text style={{ color: colors.textMuted, fontWeight: "800" }}>취소</Text>
              </TouchableOpacity>
            </View>
          ) : isMine ? (
            <>
              {row("create-outline", "게시물 수정", onEdit)}
              <TouchableOpacity style={[styles.row, { borderBottomColor: colors.borderColor }]} onPress={() => setMode("visibility")}>
                <View style={[styles.icon, { backgroundColor: colors.bgInput }]}><Ionicons name="eye-outline" size={20} color={colors.textPrimary} /></View>
                <Text style={[styles.label, { color: colors.textPrimary }]}>공개 범위 변경</Text>
                <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
              </TouchableOpacity>
              {row("share-social-outline", "공유하기", () => Share.share({ message: post?.caption || post?.title || "Aura+n 게시물" }))}
              <TouchableOpacity style={[styles.row, { borderBottomColor: colors.borderColor }]} onPress={() => setMode("delete")}>
                <View style={[styles.icon, { backgroundColor: "#fee2e2" }]}><Ionicons name="trash-outline" size={20} color="#ef4444" /></View>
                <Text style={[styles.label, { color: "#ef4444" }]}>게시물 삭제</Text>
                <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
              </TouchableOpacity>
            </>
          ) : (
            <>
              {row("person-circle-outline", "프로필 보기", onProfile)}
              {row(post?.user?.is_following ? "person-remove-outline" : "person-add-outline", post?.user?.is_following ? "팔로우 취소" : "팔로우", onFollow)}
              {row("eye-off-outline", "이 게시물 숨기기", onHide)}
              {row("ban-outline", "사용자 차단", onBlock, true)}
              {row("flag-outline", "신고하기", onReport, true)}
            </>
          )}
          {mode === "menu" && <TouchableOpacity style={styles.cancelButton} onPress={close}><Text style={{ color: colors.textMuted, fontWeight: "800" }}>닫기</Text></TouchableOpacity>}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.5)" },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 18 },
  handle: { width: 44, height: 5, borderRadius: 3, alignSelf: "center", marginBottom: 13 },
  title: { fontSize: 18, fontWeight: "900", marginBottom: 8 },
  row: { minHeight: 58, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", marginRight: 12 },
  label: { flex: 1, fontSize: 15, fontWeight: "700" },
  cancelButton: { minHeight: 45, alignItems: "center", justifyContent: "center", marginTop: 6 },
  confirm: { alignItems: "center", paddingVertical: 12 },
  confirmText: { textAlign: "center", lineHeight: 21 },
  deleteButton: { width: "100%", minHeight: 50, borderRadius: 15, backgroundColor: "#ef4444", alignItems: "center", justifyContent: "center", marginTop: 18 },
  deleteText: { color: "#fff", fontWeight: "900" },
});
