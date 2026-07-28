import React, { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import api from "../services/api";
import { useTheme } from "../context/ThemeContext";

const TOP_LEVEL_SLUG_ORDER = ["anonymous", "info", "partner"];
const ANONYMOUS_CHILD_SLUG_ORDER = [
  "anonymous-worries",
  "anonymous-relationship",
  "anonymous-daily",
  "anonymous-coming-out",
];

const priorityForBoard = (board: any, siblingOrder: string[]) => {
  const slug = String(board.slug || "").toLowerCase();
  const exactIndex = siblingOrder.indexOf(slug);
  if (exactIndex >= 0) return exactIndex;
  if (siblingOrder === TOP_LEVEL_SLUG_ORDER && slug.includes("partner")) return 2;
  return 100 + Number(board.sort_order || 0);
};

const sortSiblingBoards = (items: any[], siblingOrder: string[] = []) =>
  [...items].sort((a, b) => {
    const priorityDifference = priorityForBoard(a, siblingOrder) - priorityForBoard(b, siblingOrder);
    if (priorityDifference !== 0) return priorityDifference;
    const sortDifference = Number(a.sort_order || 0) - Number(b.sort_order || 0);
    if (sortDifference !== 0) return sortDifference;
    return String(a.name || "").localeCompare(String(b.name || ""), "ko");
  });

export const CommunityAdminScreen = ({ navigation }: any) => {
  const { colors } = useTheme();
  const [boards, setBoards] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const [anonymous, setAnonymous] = useState(false);
  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeContent, setNoticeContent] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api.get("/community/boards?include_inactive=true");
      setBoards(res.data?.data || []);
    } catch (e: any) {
      Alert.alert("오류", e.response?.data?.detail || "게시판을 불러오지 못했습니다.");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const reset = () => { setEditing(null); setName(""); setSlug(""); setParentId(null); setAnonymous(false); };
  const select = (board: any) => { setEditing(board); setName(board.name); setSlug(board.slug); setParentId(board.parent_id); setAnonymous(board.is_anonymous); };
  const save = async () => {
    if (!name.trim() || !slug.trim()) return Alert.alert("알림", "게시판명과 영문 식별자를 입력해 주세요.");
    try {
      const body = { name: name.trim(), slug: slug.trim().toLowerCase(), parent_id: parentId, is_anonymous: anonymous };
      if (editing) await api.patch(`/community/admin/boards/${editing.id}`, body); else await api.post("/community/admin/boards", body);
      reset();
      load();
    } catch (e: any) { Alert.alert("오류", e.response?.data?.detail || "게시판 저장에 실패했습니다."); }
  };
  const moveBoard = async (board: any, direction: "up" | "down") => {
    try {
      const res = await api.post(`/community/admin/boards/${board.id}/reorder`, { direction });
      setBoards(res.data?.data || []);
    } catch (e: any) { Alert.alert("오류", e.response?.data?.detail || "게시판 순서 변경에 실패했습니다."); }
  };
  const closeBoard = (board: any) => {
    if (board.is_default) return Alert.alert("안내", "공통은 기본 하위 게시판이라 폐쇄할 수 없습니다.");
    return Alert.alert("게시판 폐쇄", `‘${board.name}’ 게시판을 폐쇄할까요?`, [
    { text: "취소", style: "cancel" },
    { text: "다음", style: "destructive", onPress: () => Alert.alert("최종 확인", "기존 글은 보존되고 새 글 작성만 막힙니다.", [
      { text: "취소", style: "cancel" },
      { text: "폐쇄", style: "destructive", onPress: async () => { try { await api.delete(`/community/admin/boards/${board.id}?confirm_name=${encodeURIComponent(board.name)}`); load(); } catch (e: any) { Alert.alert("오류", e.response?.data?.detail || "폐쇄에 실패했습니다."); } } },
    ]) },
    ]);
  };
  const postNotice = async () => {
    if (!noticeTitle.trim() || !noticeContent.trim()) return Alert.alert("알림", "공지 제목과 내용을 입력해 주세요.");
    try { await api.post("/community/admin/notices", { title: noticeTitle.trim(), content: noticeContent.trim() }); setNoticeTitle(""); setNoticeContent(""); Alert.alert("완료", "전체 공지가 모든 게시판 상단에 표시됩니다."); }
    catch { Alert.alert("오류", "공지 등록에 실패했습니다."); }
  };
  const topLevelBoards = sortSiblingBoards(
    boards.filter((board) => !board.parent_id),
    TOP_LEVEL_SLUG_ORDER,
  );
  const orderedBoardIds = new Set<string>();
  const orderedBoards = topLevelBoards.flatMap((parent) => {
    orderedBoardIds.add(parent.id);
    const childOrder = parent.slug === "anonymous" ? ANONYMOUS_CHILD_SLUG_ORDER : [];
    const children = sortSiblingBoards(
      boards.filter((board) => board.parent_id === parent.id),
      childOrder,
    );
    children.forEach((child) => orderedBoardIds.add(child.id));
    return [parent, ...children];
  });
  orderedBoards.push(...sortSiblingBoards(boards.filter((board) => !orderedBoardIds.has(board.id))));
  const parents = topLevelBoards.filter((board) => board.is_active);

  return <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
    <View style={[styles.header, { borderBottomColor: colors.borderColor }]}><TouchableOpacity onPress={() => navigation.goBack()}><Ionicons name="chevron-back" size={26} color={colors.textPrimary} /></TouchableOpacity><Text style={[styles.title, { color: colors.textPrimary }]}>커뮤니티 관리</Text><TouchableOpacity onPress={reset}><Text style={{ color: colors.accentBlue, fontWeight: "700" }}>새 게시판</Text></TouchableOpacity></View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={[styles.section, { color: colors.textPrimary }]}>게시판 순서</Text>
      {orderedBoards.map((board) => <View key={board.id} style={[styles.boardRow, board.parent_id && styles.childBoardRow, { borderColor: colors.borderColor, backgroundColor: board.parent_id ? colors.bgInput : colors.bgCard, opacity: board.is_active ? 1 : .5 }]}>
        <TouchableOpacity style={styles.boardInfo} onPress={() => select(board)}><Text style={{ color: colors.textPrimary, fontWeight: "700" }}>{board.parent_id ? "└ " : ""}{board.name}{board.is_default ? " (기본)" : ""}</Text><Text style={{ color: colors.textSecondary, fontSize: 12 }}>{board.slug} · {board.is_anonymous ? "익명" : "일반"}</Text></TouchableOpacity>
        <View style={styles.rowActions}><TouchableOpacity accessibilityLabel="게시판 위로 이동" onPress={() => moveBoard(board, "up")} style={styles.iconButton}><Ionicons name="chevron-up" size={20} color={colors.textPrimary} /></TouchableOpacity><TouchableOpacity accessibilityLabel="게시판 아래로 이동" onPress={() => moveBoard(board, "down")} style={styles.iconButton}><Ionicons name="chevron-down" size={20} color={colors.textPrimary} /></TouchableOpacity><TouchableOpacity onPress={() => closeBoard(board)}><Text style={{ color: "#ef4444", fontWeight: "700" }}>폐쇄</Text></TouchableOpacity></View>
      </View>)}
      <Text style={[styles.hint, { color: colors.textSecondary }]}>위·아래 버튼은 같은 상위 게시판 안에서만 순서를 바꿉니다.</Text>
      <Text style={[styles.section, { color: colors.textPrimary }]}>{editing ? "게시판 수정" : "게시판 생성"}</Text>
      <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderColor }]} placeholder="게시판명" placeholderTextColor={colors.textMuted} value={name} onChangeText={setName} />
      <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderColor }]} placeholder="영문 식별자 (예: health-info)" placeholderTextColor={colors.textMuted} value={slug} onChangeText={setSlug} autoCapitalize="none" />
      <Text style={{ color: colors.textSecondary, marginBottom: 6 }}>상위 게시판 선택 (선택하면 하위 게시판)</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}><TouchableOpacity onPress={() => setParentId(null)} style={[styles.chip, { backgroundColor: !parentId ? colors.accentPurple : colors.bgCard }]}><Text style={{ color: !parentId ? "#fff" : colors.textPrimary }}>상위 없음</Text></TouchableOpacity>{parents.map((parent) => <TouchableOpacity key={parent.id} onPress={() => setParentId(parent.id)} style={[styles.chip, { backgroundColor: parentId === parent.id ? colors.accentPurple : colors.bgCard }]}><Text style={{ color: parentId === parent.id ? "#fff" : colors.textPrimary }}>{parent.name}</Text></TouchableOpacity>)}</ScrollView>
      <View style={styles.switchRow}><Text style={{ color: colors.textPrimary }}>익명 게시판</Text><Switch value={anonymous} onValueChange={setAnonymous} /></View>
      <TouchableOpacity style={[styles.primary, { backgroundColor: colors.accentBlue }]} onPress={save}><Text style={styles.primaryText}>{editing ? "수정 저장" : "게시판 생성"}</Text></TouchableOpacity>
      <Text style={[styles.section, { color: colors.textPrimary }]}>전체 공지</Text>
      <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderColor }]} placeholder="공지 제목" placeholderTextColor={colors.textMuted} value={noticeTitle} onChangeText={setNoticeTitle} />
      <TextInput style={[styles.input, styles.noticeInput, { color: colors.textPrimary, borderColor: colors.borderColor }]} placeholder="모든 게시판 상단에 표시할 공지 내용" placeholderTextColor={colors.textMuted} value={noticeContent} onChangeText={setNoticeContent} multiline />
      <TouchableOpacity style={[styles.primary, { backgroundColor: colors.accentPurple }]} onPress={postNotice}><Text style={styles.primaryText}>전체 공지 등록</Text></TouchableOpacity>
    </ScrollView>
  </SafeAreaView>;
};

const styles = StyleSheet.create({ container: { flex: 1 }, header: { height: 54, paddingHorizontal: 16, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, title: { fontSize: 17, fontWeight: "800" }, content: { padding: 16, paddingBottom: 50 }, section: { fontSize: 16, fontWeight: "800", marginTop: 12, marginBottom: 10 }, hint: { fontSize: 12, marginBottom: 8 }, boardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8 }, childBoardRow: { marginLeft: 20, borderRadius: 14 }, boardInfo: { flex: 1, marginRight: 8 }, rowActions: { flexDirection: "row", alignItems: "center", gap: 4 }, iconButton: { padding: 4 }, input: { borderWidth: 1, borderRadius: 10, minHeight: 46, paddingHorizontal: 12, marginBottom: 10 }, chips: { gap: 8, paddingBottom: 12 }, chip: { paddingHorizontal: 12, height: 34, justifyContent: "center", borderRadius: 17 }, switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }, primary: { minHeight: 46, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 8 }, primaryText: { color: "#fff", fontWeight: "800" }, noticeInput: { minHeight: 100, textAlignVertical: "top", paddingTop: 12 } });
