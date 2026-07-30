import React, { useState, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
  Image,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useTheme } from "../context/ThemeContext";
import { RichTextRenderer } from "./RichTextRenderer";
import api from "../services/api";

interface SmartEditorProps {
  value: string;
  onChange: (htmlContent: string) => void;
  youtubeUrl?: string;
  onYoutubeUrlChange?: (url: string) => void;
  placeholder?: string;
  minHeight?: number;
  onImagePicked?: (uri: string) => void;
}

// 이모티콘 / 디시콘 목록
const DC_ICONS = [
  { id: "dc1", label: "짱짱", emoji: "👍", bg: "#ef4444", text: "짱!" },
  { id: "dc2", label: "굿", emoji: "🔥", bg: "#f59e0b", text: "굿!" },
  { id: "dc3", label: "ㅋㅋㅋ", emoji: "😆", bg: "#10b981", text: "ㅋㅋㅋ" },
  { id: "dc4", label: "ㅠㅠ", emoji: "😭", bg: "#3b82f6", text: "ㅠㅠ" },
  { id: "dc5", label: "축하", emoji: "🎉", bg: "#8b5cf6", text: "축하" },
  { id: "dc6", label: "하트", emoji: "💖", bg: "#ec4899", text: "LOVE" },
  { id: "dc7", label: "최고", emoji: "⭐", bg: "#facc15", text: "BEST" },
  { id: "dc8", label: "경악", emoji: "😱", bg: "#64748b", text: "헐!" },
  { id: "dc9", label: "궁금", emoji: "🤔", bg: "#06b6d4", text: "글쎄?" },
  { id: "dc10", label: "당황", emoji: "😳", bg: "#f97316", text: "어라?" },
  { id: "dc11", label: "나이스", emoji: "🚀", bg: "#6366f1", text: "GO!" },
  { id: "dc12", label: "체크", emoji: "✅", bg: "#22c55e", text: "완료" },
];

// AI 이미지 샘플 프롬프트 프리셋
const AI_PRESETS = [
  { label: "사이버펑크 도시", url: "https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=800&q=80" },
  { label: "귀여운 고양이 3D", url: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=800&q=80" },
  { label: "신비로운 우주 유영", url: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80" },
  { label: "몽환적인 네온 야경", url: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=800&q=80" },
  { label: "수채화 풍경화", url: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=800&q=80" },
];

const FONTS = ["맑은 고딕", "돋움", "굴림", "바탕", "Pretendard", "Arial", "sans-serif"];
const FONT_SIZES = [10, 12, 14, 16, 18, 20, 24, 32];
const TEXT_COLORS = [
  { name: "검정", code: "#ffffff" },
  { name: "빨강", code: "#ef4444" },
  { name: "파랑", code: "#3b82f6" },
  { name: "초록", code: "#10b981" },
  { name: "노랑", code: "#facc15" },
  { name: "보라", code: "#8b5cf6" },
  { name: "주황", code: "#f97316" },
];
const BG_COLORS = [
  { name: "없음", code: "transparent" },
  { name: "형광노랑", code: "rgba(250, 204, 21, 0.3)" },
  { name: "형광하늘", code: "rgba(56, 189, 248, 0.3)" },
  { name: "형광분홍", code: "rgba(244, 114, 182, 0.3)" },
  { name: "형광연두", code: "rgba(74, 222, 128, 0.3)" },
  { name: "다크그레이", code: "rgba(255, 255, 255, 0.15)" },
];

export const SmartEditor: React.FC<SmartEditorProps> = ({
  value,
  onChange,
  youtubeUrl,
  onYoutubeUrlChange,
  placeholder = "내용을 입력하세요...",
  minHeight = 280,
  onImagePicked,
}) => {
  const { colors } = useTheme();

  // HTML 코드 직접 보기 모드 (기본 false: 비주얼 서식 뷰)
  const [isHtmlMode, setIsHtmlMode] = useState(false);

  // 모달 상태들
  const [activeModal, setActiveModal] = useState<
    "none" | "dcicon" | "youtube" | "external" | "series" | "poll" | "ai" | "link"
  >("none");

  // 모달 입력값 상태들
  const [modalInputUrl, setModalInputUrl] = useState("");
  const [modalTitle, setModalTitle] = useState("");
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["옵션 1", "옵션 2"]);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);

  // YouTube API 검증 상태
  const [verifyingYoutube, setVerifyingYoutube] = useState(false);
  const [youtubeVerifyResult, setYoutubeVerifyResult] = useState<{
    success: boolean;
    title?: string;
    thumbnailUrl?: string;
    message?: string;
  } | null>(null);

  // 툴바 선택 상태
  const [selectedFont, setSelectedFont] = useState("맑은 고딕");
  const [selectedFontSize, setSelectedFontSize] = useState(14);
  const [showFontDropdown, setShowFontDropdown] = useState(false);
  const [showSizeDropdown, setShowSizeDropdown] = useState(false);
  const [showColorDropdown, setShowColorDropdown] = useState(false);
  const [showBgDropdown, setShowBgDropdown] = useState(false);
  const [showTableDropdown, setShowTableDropdown] = useState(false);
  const [showAlignDropdown, setShowAlignDropdown] = useState(false);

  // 시각적 비주얼 텍스트 상태 (HTML 태그가 제거된 에디터 입력 문자열)
  const [visualText, setVisualText] = useState(() => {
    return value ? value.replace(/<[^>]+>/g, "") : "";
  });

  // 실행 히스토리 (Undo / Redo)
  const historyRef = useRef<string[]>([value || ""]);
  const historyIndexRef = useRef<number>(0);

  const updateValue = (newValue: string) => {
    onChange(newValue);
    setVisualText(newValue.replace(/<[^>]+>/g, ""));

    if (historyRef.current[historyIndexRef.current] !== newValue) {
      const nextHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
      nextHistory.push(newValue);
      historyRef.current = nextHistory;
      historyIndexRef.current = nextHistory.length - 1;
    }
  };

  const handleUndo = () => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current -= 1;
      const prev = historyRef.current[historyIndexRef.current];
      onChange(prev);
      setVisualText(prev.replace(/<[^>]+>/g, ""));
    }
  };

  const handleRedo = () => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current += 1;
      const next = historyRef.current[historyIndexRef.current];
      onChange(next);
      setVisualText(next.replace(/<[^>]+>/g, ""));
    }
  };

  // 태그 추가 함수
  const appendHtmlSnippet = (snippet: string) => {
    const nextVal = value ? `${value}\n${snippet}` : snippet;
    updateValue(nextVal);
  };

  const applyTextFormat = (tag: string, attr: string = "") => {
    if (isHtmlMode) {
      const tagOpen = attr ? `<${tag} ${attr}>` : `<${tag}>`;
      const tagClose = `</${tag}>`;
      updateValue(`${value}${tagOpen}선택텍스트${tagClose}`);
    } else {
      if (tag === "b") {
        appendHtmlSnippet("<b>굵은 텍스트</b>");
      } else if (tag === "i") {
        appendHtmlSnippet("<i>기울임 텍스트</i>");
      } else if (tag === "u") {
        appendHtmlSnippet("<u>밑줄 텍스트</u>");
      } else if (tag === "s" || tag === "strike") {
        appendHtmlSnippet("<s>취소선 텍스트</s>");
      }
    }
  };

  const applyColor = (colorCode: string) => {
    setShowColorDropdown(false);
    appendHtmlSnippet(`<span style="color:${colorCode}; font-weight:bold;">색상 텍스트</span>`);
  };

  const applyBgColor = (bgCode: string) => {
    setShowBgDropdown(false);
    appendHtmlSnippet(`<span style="background-color:${bgCode}; padding: 2px 4px; border-radius: 4px;">배경색 텍스트</span>`);
  };

  const insertTable = (rows: number, cols: number) => {
    setShowTableDropdown(false);
    let tableHtml = `<table border="1" style="width:100%; border-collapse:collapse; border:1px solid #444; margin:10px 0;">\n`;
    for (let r = 0; r < rows; r++) {
      tableHtml += `  <tr>\n`;
      for (let c = 0; c < cols; c++) {
        tableHtml += `    <td style="padding:8px; border:1px solid #444; text-align:center; color:#eee;">셀 ${r + 1}-${c + 1}</td>\n`;
      }
      tableHtml += `  </tr>\n`;
    }
    tableHtml += `</table>`;
    appendHtmlSnippet(tableHtml);
  };

  const insertList = (type: "ul" | "ol") => {
    const listHtml = `<${type}>\n  <li>첫 번째 항목</li>\n  <li>두 번째 항목</li>\n</${type}>`;
    appendHtmlSnippet(listHtml);
  };

  const applyAlign = (align: "left" | "center" | "right" | "justify") => {
    setShowAlignDropdown(false);
    const alignHtml = `<div style="text-align:${align}; margin:6px 0;">정렬 텍스트</div>`;
    appendHtmlSnippet(alignHtml);
  };

  // 1. [이미지] 버튼 클릭 -> 갤러리 사진 선택 및 에디터 캔버스 비주얼 노출
  const handlePickImage = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("권한 필요", "사진을 선택하려면 접근 권한이 필요합니다.");
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.85,
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        const uri = res.assets[0].uri;
        if (onImagePicked) onImagePicked(uri);
        // 에디터 본문에 시각적 <img> 태그 삽입
        appendHtmlSnippet(`<img src="${uri}" style="max-width:100%; border-radius:8px; margin:8px 0;" alt="첨부 이미지" />`);
      }
    } catch (e) {
      console.log("Image pick error:", e);
    }
  };

  const insertDcIcon = (icon: typeof DC_ICONS[0]) => {
    setActiveModal("none");
    const iconHtml = `<span style="display:inline-flex; align-items:center; justify-content:center; background:${icon.bg}; color:#fff; padding:6px 12px; border-radius:18px; font-weight:bold; font-size:13px; margin:4px; box-shadow:0 2px 5px rgba(0,0,0,0.3);">${icon.emoji} ${icon.text}</span>`;
    appendHtmlSnippet(iconHtml);
  };

  // 3. [유튜브] 버튼 클릭 -> 백엔드 YouTube Data API 실시간 검증 호출 및 결과 팝업 노출
  const insertYoutube = async () => {
    const url = modalInputUrl.trim();
    if (!url) {
      setYoutubeVerifyResult({
        success: false,
        message: "YouTube 영상 주소를 입력해주세요.",
      });
      return;
    }

    setVerifyingYoutube(true);
    setYoutubeVerifyResult(null);

    try {
      const res = await api.post("/posts/verify-youtube", { url });
      if (res.data?.data) {
        const verified = res.data.data;
        if (onYoutubeUrlChange) {
          onYoutubeUrlChange(verified.url);
        }
        setYoutubeVerifyResult({
          success: true,
          title: verified.title,
          thumbnailUrl: verified.thumbnail_url,
          message: "YouTube Data API 검증 성공: 공개·외부재생가능·성인물/연령제한없음 확인 완료",
        });
      }
    } catch (err: any) {
      console.log("YouTube Verification Error:", err);
      const serverMsg =
        err.response?.data?.error?.message ||
        err.response?.data?.detail ||
        "YouTube 영상 검증에 실패했습니다. (유효한 일반 영상 주소인지 확인해 주세요)";
      setYoutubeVerifyResult({
        success: false,
        message: typeof serverMsg === "string" ? serverMsg : "YouTube 일반 영상 주소만 허용됩니다.",
      });
    } finally {
      setVerifyingYoutube(false);
    }
  };

  const insertExternal = () => {
    if (!modalInputUrl.trim()) return;
    const extHtml = modalInputUrl.trim().startsWith("<")
      ? modalInputUrl.trim()
      : `<iframe src="${modalInputUrl.trim()}" style="width:100%; height:300px; border:1px solid #444; border-radius:8px; margin:10px 0;"></iframe>`;
    appendHtmlSnippet(extHtml);
    setModalInputUrl("");
    setActiveModal("none");
  };

  const insertSeries = () => {
    if (!modalTitle.trim()) return;
    const seriesHtml = `<div style="background:linear-gradient(135deg, #3b82f6, #8b5cf6); padding:10px 16px; border-radius:8px; color:#fff; font-weight:bold; margin:10px 0;">🩵 [시리즈] ${modalTitle.trim()}</div>`;
    appendHtmlSnippet(seriesHtml);
    setModalTitle("");
    setActiveModal("none");
  };

  const insertPoll = () => {
    if (!pollQuestion.trim()) return;
    const optionsHtml = pollOptions
      .filter((o) => o.trim())
      .map((opt, i) => `<div style="background:#2d2d30; padding:8px 12px; border-radius:6px; margin-top:6px; color:#eee;">${i + 1}. ${opt}</div>`)
      .join("");
    const pollHtml = `<div style="border:1px solid #3b82f6; background:#1e1e24; padding:14px; border-radius:10px; margin:12px 0;"><div style="font-weight:bold; color:#60a5fa; font-size:15px; margin-bottom:8px;">📊 투표: ${pollQuestion}</div>${optionsHtml}</div>`;
    appendHtmlSnippet(pollHtml);
    setPollQuestion("");
    setPollOptions(["옵션 1", "옵션 2"]);
    setActiveModal("none");
  };

  const generateAiImage = (presetUrl?: string) => {
    setAiGenerating(true);
    setTimeout(() => {
      const url = presetUrl || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80";
      if (onImagePicked) onImagePicked(url);
      appendHtmlSnippet(`<img src="${url}" style="width:100%; border-radius:10px; margin:10px 0; border:1px solid #8b5cf6;" alt="AI 생성 이미지" />`);
      setAiGenerating(false);
      setAiPrompt("");
      setActiveModal("none");
    }, 1200);
  };

  const insertLink = () => {
    if (!modalInputUrl.trim()) return;
    const linkText = modalTitle.trim() || modalInputUrl.trim();
    const linkHtml = `<a href="${modalInputUrl.trim()}" target="_blank" style="color:#60a5fa; text-decoration:underline;">${linkText}</a>`;
    appendHtmlSnippet(linkHtml);
    setModalInputUrl("");
    setModalTitle("");
    setActiveModal("none");
  };

  // 비주얼 텍스트 변경 처리 (HTML 태그가 노출되지 않는 일반 텍스트 모드)
  const handleVisualTextChange = (text: string) => {
    setVisualText(text);
    // 이미지/HTML 블록이 포함되어 있으면 이전 HTML 블록 유지 후 텍스트 업데이트
    if (/<[a-z][\s\S]*>/i.test(value)) {
      const nonTextParts: string[] = value.match(/<[^>]+>/g) || [];
      const hasImages = nonTextParts.some((p: string) => p.startsWith("<img"));
      if (hasImages) {
        const imgTags = nonTextParts.filter((p: string) => p.startsWith("<img")).join("\n");
        onChange(`${text}\n${imgTags}`);
        return;
      }
    }
    onChange(text);
  };

  return (
    <View style={styles.editorWrapper}>
      {/* ── 툴바 1열 (이미지, 유튜브, 디시콘, 외부콘텐츠, 시리즈, 투표, AI 이미지 & HTML 모드 체크) ── */}
      <View style={styles.toolbarRow1}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolbarScroll}>
          {/* 이미지 선택 버튼 */}
          <TouchableOpacity style={styles.toolBtn1} onPress={handlePickImage}>
            <Ionicons name="image-outline" size={15} color="#2563eb" />
            <Text style={styles.toolBtn1Text}>이미지</Text>
          </TouchableOpacity>

          {/* 유튜브 전용 버튼 (기존 동영상 버튼 -> 유튜브 통합) */}
          <TouchableOpacity
            style={styles.toolBtn1}
            onPress={() => {
              setModalInputUrl(youtubeUrl || "");
              setActiveModal("youtube");
            }}
          >
            <Ionicons name="logo-youtube" size={15} color="#dc2626" />
            <Text style={styles.toolBtn1Text}>유튜브</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.toolBtn1} onPress={() => setActiveModal("dcicon")}>
            <Ionicons name="happy-outline" size={15} color="#7c3aed" />
            <Text style={styles.toolBtn1Text}>디시콘</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.toolBtn1} onPress={() => setActiveModal("external")}>
            <Ionicons name="open-outline" size={15} color="#4f46e5" />
            <Text style={styles.toolBtn1Text}>외부콘텐츠</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.toolBtn1} onPress={() => setActiveModal("series")}>
            <Ionicons name="grid-outline" size={15} color="#2563eb" />
            <Text style={styles.toolBtn1Text}>시리즈</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.toolBtn1} onPress={() => setActiveModal("poll")}>
            <Ionicons name="stats-chart-outline" size={15} color="#059669" />
            <Text style={styles.toolBtn1Text}>투표</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.toolBtn1} onPress={() => setActiveModal("ai")}>
            <Ionicons name="sparkles-outline" size={15} color="#d97706" />
            <Text style={styles.toolBtn1Text}>AI 이미지</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* HTML 원본 코드 편집 모드 체크박스 */}
        <TouchableOpacity
          style={styles.htmlCheckboxContainer}
          onPress={() => setIsHtmlMode(!isHtmlMode)}
          activeOpacity={0.8}
        >
          <View style={[styles.checkbox, isHtmlMode && styles.checkboxChecked]}>
            {isHtmlMode && <Ionicons name="checkmark" size={12} color="#fff" />}
          </View>
          <Text style={styles.htmlCheckboxLabel}>HTML</Text>
        </TouchableOpacity>
      </View>

      {/* ── 툴바 2열 (서식 툴바 - 폰트, 크기, Bold, Italic, Color, Table, Align, Undo, Redo, Link) ── */}
      <View style={styles.toolbarRow2}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolbarScroll}>
          <TouchableOpacity
            style={styles.dropdownBtn}
            onPress={() => {
              setShowFontDropdown(!showFontDropdown);
              setShowSizeDropdown(false);
              setShowColorDropdown(false);
              setShowBgDropdown(false);
              setShowTableDropdown(false);
              setShowAlignDropdown(false);
            }}
          >
            <Text style={styles.dropdownText}>{selectedFont}</Text>
            <Ionicons name="chevron-down" size={12} color="#444" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.dropdownBtnSmall}
            onPress={() => {
              setShowSizeDropdown(!showSizeDropdown);
              setShowFontDropdown(false);
              setShowColorDropdown(false);
              setShowBgDropdown(false);
              setShowTableDropdown(false);
              setShowAlignDropdown(false);
            }}
          >
            <Text style={styles.dropdownText}>{selectedFontSize}</Text>
            <Ionicons name="chevron-down" size={12} color="#444" />
          </TouchableOpacity>

          <View style={styles.separator} />

          <TouchableOpacity style={styles.formatBtn} onPress={() => applyTextFormat("b")}>
            <Text style={[styles.formatBtnText, { fontWeight: "bold" }]}>가</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.formatBtn} onPress={() => applyTextFormat("i")}>
            <Text style={[styles.formatBtnText, { fontStyle: "italic" }]}>가</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.formatBtn} onPress={() => applyTextFormat("u")}>
            <Text style={[styles.formatBtnText, { textDecorationLine: "underline" }]}>가</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.formatBtn} onPress={() => applyTextFormat("s")}>
            <Text style={[styles.formatBtnText, { textDecorationLine: "line-through" }]}>가</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.formatBtn}
            onPress={() => {
              setShowColorDropdown(!showColorDropdown);
              setShowFontDropdown(false);
              setShowSizeDropdown(false);
              setShowBgDropdown(false);
              setShowTableDropdown(false);
              setShowAlignDropdown(false);
            }}
          >
            <Text style={[styles.formatBtnText, { color: "#dc2626" }]}>가</Text>
            <Ionicons name="caret-down-sharp" size={10} color="#666" style={{ marginLeft: 2 }} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.formatBtn}
            onPress={() => {
              setShowBgDropdown(!showBgDropdown);
              setShowFontDropdown(false);
              setShowSizeDropdown(false);
              setShowColorDropdown(false);
              setShowTableDropdown(false);
              setShowAlignDropdown(false);
            }}
          >
            <View style={{ backgroundColor: "#fef08a", paddingHorizontal: 3, borderRadius: 2 }}>
              <Text style={[styles.formatBtnText, { color: "#000" }]}>가</Text>
            </View>
            <Ionicons name="caret-down-sharp" size={10} color="#666" style={{ marginLeft: 2 }} />
          </TouchableOpacity>

          <View style={styles.separator} />

          <TouchableOpacity
            style={styles.formatBtn}
            onPress={() => {
              setShowTableDropdown(!showTableDropdown);
              setShowFontDropdown(false);
              setShowSizeDropdown(false);
              setShowColorDropdown(false);
              setShowBgDropdown(false);
              setShowAlignDropdown(false);
            }}
          >
            <Ionicons name="grid-sharp" size={15} color="#333" />
            <Ionicons name="caret-down-sharp" size={10} color="#666" style={{ marginLeft: 2 }} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.formatBtn} onPress={() => insertList("ul")}>
            <Ionicons name="list" size={16} color="#333" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.formatBtn} onPress={() => insertList("ol")}>
            <Text style={{ fontSize: 13, fontWeight: "bold", color: "#333" }}>1.</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.formatBtn}
            onPress={() => {
              setShowAlignDropdown(!showAlignDropdown);
              setShowFontDropdown(false);
              setShowSizeDropdown(false);
              setShowColorDropdown(false);
              setShowBgDropdown(false);
              setShowTableDropdown(false);
            }}
          >
            <Ionicons name="reorder-three" size={18} color="#333" />
            <Ionicons name="caret-down-sharp" size={10} color="#666" style={{ marginLeft: 2 }} />
          </TouchableOpacity>

          <View style={styles.separator} />

          <TouchableOpacity style={styles.formatBtn} onPress={handleUndo}>
            <Ionicons name="arrow-undo-outline" size={15} color="#333" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.formatBtn} onPress={handleRedo}>
            <Ionicons name="arrow-redo-outline" size={15} color="#333" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.formatBtn} onPress={() => setActiveModal("link")}>
            <Ionicons name="link-outline" size={16} color="#333" />
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* ── Dropdown 선택 메뉴들 ── */}
      {showFontDropdown && (
        <View style={[styles.dropdownMenu, { left: 8 }]}>
          {FONTS.map((font) => (
            <TouchableOpacity
              key={font}
              style={styles.dropdownMenuItem}
              onPress={() => {
                setSelectedFont(font);
                setShowFontDropdown(false);
              }}
            >
              <Text style={{ fontSize: 13, fontFamily: font }}>{font}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {showSizeDropdown && (
        <View style={[styles.dropdownMenu, { left: 95 }]}>
          {FONT_SIZES.map((sz) => (
            <TouchableOpacity
              key={sz}
              style={styles.dropdownMenuItem}
              onPress={() => {
                setSelectedFontSize(sz);
                setShowSizeDropdown(false);
              }}
            >
              <Text style={{ fontSize: 13 }}>{sz}px</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {showColorDropdown && (
        <View style={[styles.dropdownMenu, { left: 210, flexDirection: "row", flexWrap: "wrap", width: 150 }]}>
          {TEXT_COLORS.map((col) => (
            <TouchableOpacity
              key={col.code}
              style={{ width: 30, height: 30, backgroundColor: col.code, margin: 4, borderRadius: 15, borderWidth: 1, borderColor: "#ccc" }}
              onPress={() => applyColor(col.code)}
            />
          ))}
        </View>
      )}

      {showBgDropdown && (
        <View style={[styles.dropdownMenu, { left: 240, flexDirection: "row", flexWrap: "wrap", width: 150 }]}>
          {BG_COLORS.map((col) => (
            <TouchableOpacity
              key={col.name}
              style={{ width: 30, height: 30, backgroundColor: col.code === "transparent" ? "#fff" : col.code, margin: 4, borderRadius: 15, borderWidth: 1, borderColor: "#ccc", justifyContent: "center", alignItems: "center" }}
              onPress={() => applyBgColor(col.code)}
            >
              {col.code === "transparent" && <Text style={{ fontSize: 10, color: "#888" }}>X</Text>}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {showTableDropdown && (
        <View style={[styles.dropdownMenu, { left: 270 }]}>
          <TouchableOpacity style={styles.dropdownMenuItem} onPress={() => insertTable(2, 2)}>
            <Text style={{ fontSize: 13 }}>2x2 테이블</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dropdownMenuItem} onPress={() => insertTable(3, 3)}>
            <Text style={{ fontSize: 13 }}>3x3 테이블</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dropdownMenuItem} onPress={() => insertTable(4, 4)}>
            <Text style={{ fontSize: 13 }}>4x4 테이블</Text>
          </TouchableOpacity>
        </View>
      )}

      {showAlignDropdown && (
        <View style={[styles.dropdownMenu, { left: 340 }]}>
          <TouchableOpacity style={styles.dropdownMenuItem} onPress={() => applyAlign("left")}>
            <Text style={{ fontSize: 13 }}>왼쪽 정렬</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dropdownMenuItem} onPress={() => applyAlign("center")}>
            <Text style={{ fontSize: 13 }}>중앙 정렬</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dropdownMenuItem} onPress={() => applyAlign("right")}>
            <Text style={{ fontSize: 13 }}>오른쪽 정렬</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── 에디터 본문 캔버스 영역 (어두운 배경 Dark Mode Canvas) ── */}
      <View style={[styles.canvasContainer, { minHeight }]}>
        {isHtmlMode ? (
          /* HTML 체크박스 켜짐: 원본 HTML 코드 편집창 */
          <TextInput
            style={styles.canvasInput}
            multiline
            placeholder="<html>..."
            placeholderTextColor="#777"
            value={value}
            onChangeText={updateValue}
            textAlignVertical="top"
          />
        ) : (
          /* HTML 체크박스 꺼짐: HTML 태그 없이 시각적 서식 & 이미지 시각화 뷰 */
          <ScrollView nestedScrollEnabled style={{ flex: 1 }}>
            {value ? (
              <RichTextRenderer content={value} style={{ marginBottom: 10 }} />
            ) : null}

            <TextInput
              style={[
                styles.visualInput,
                {
                  fontFamily: selectedFont !== "맑은 고딕" ? selectedFont : undefined,
                  fontSize: selectedFontSize,
                },
              ]}
              multiline
              placeholder={placeholder}
              placeholderTextColor="#777"
              value={visualText}
              onChangeText={handleVisualTextChange}
              textAlignVertical="top"
            />
          </ScrollView>
        )}
      </View>

      {/* ── 모달들 (디시콘, 유튜브, 외부콘텐츠, 시리즈, 투표, AI 이미지, 링크) ── */}
      <Modal
        visible={activeModal !== "none"}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveModal("none")}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setActiveModal("none")}
        >
          <TouchableOpacity activeOpacity={1} style={styles.modalCard}>
            {/* 1. 디시콘 이모티콘 선택 모달 */}
            {activeModal === "dcicon" && (
              <View>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitleText}>🤡 디시콘 이모티콘 선택</Text>
                  <TouchableOpacity onPress={() => setActiveModal("none")}>
                    <Ionicons name="close" size={22} color="#aaa" />
                  </TouchableOpacity>
                </View>
                <ScrollView contentContainerStyle={styles.dcIconGrid}>
                  {DC_ICONS.map((icon) => (
                    <TouchableOpacity
                      key={icon.id}
                      style={[styles.dcIconItem, { backgroundColor: icon.bg }]}
                      onPress={() => insertDcIcon(icon)}
                    >
                      <Text style={{ fontSize: 24 }}>{icon.emoji}</Text>
                      <Text style={styles.dcIconText}>{icon.text}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* 2. 유튜브 전용 영상 URL 입력 모달 (API 자동 검증 연동) */}
            {activeModal === "youtube" && (
              <View>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitleText}>📺 YouTube 영상 등록</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setYoutubeVerifyResult(null);
                      setActiveModal("none");
                    }}
                  >
                    <Ionicons name="close" size={22} color="#aaa" />
                  </TouchableOpacity>
                </View>

                {/* 경고 문구 출력 박스 */}
                <View style={{ backgroundColor: "#332a15", borderColor: "#f59e0b", borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="warning-outline" size={18} color="#f59e0b" />
                  <Text style={{ color: "#fef08a", fontSize: 12, lineHeight: 17, flex: 1, fontWeight: "600" }}>
                    일반 영상 1개만 가능하며, 공개·외부 재생 가능·연령 제한 없음이 API로 확인된 영상만 등록됩니다.
                  </Text>
                </View>

                {/* API 검증 결과 팝업 카드 */}
                {youtubeVerifyResult && (
                  <View
                    style={{
                      backgroundColor: youtubeVerifyResult.success ? "#064e3b" : "#450a0a",
                      borderColor: youtubeVerifyResult.success ? "#10b981" : "#ef4444",
                      borderWidth: 1,
                      borderRadius: 10,
                      padding: 12,
                      marginBottom: 12,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <Ionicons
                        name={youtubeVerifyResult.success ? "checkmark-circle" : "alert-circle"}
                        size={20}
                        color={youtubeVerifyResult.success ? "#34d399" : "#fca5a5"}
                      />
                      <Text
                        style={{
                          color: youtubeVerifyResult.success ? "#a7f3d0" : "#fecaca",
                          fontWeight: "bold",
                          fontSize: 14,
                        }}
                      >
                        {youtubeVerifyResult.success ? "YouTube API 검증 완료" : "YouTube API 검증 실패"}
                      </Text>
                    </View>

                    {youtubeVerifyResult.success && youtubeVerifyResult.thumbnailUrl ? (
                      <View style={{ flexDirection: "row", gap: 10, marginVertical: 6, alignItems: "center" }}>
                        <Image
                          source={{ uri: youtubeVerifyResult.thumbnailUrl }}
                          style={{ width: 80, height: 50, borderRadius: 6 }}
                        />
                        <Text style={{ flex: 1, color: "#fff", fontSize: 13, fontWeight: "bold" }} numberOfLines={2}>
                          {youtubeVerifyResult.title}
                        </Text>
                      </View>
                    ) : null}

                    <Text style={{ color: "#eee", fontSize: 12, lineHeight: 16 }}>
                      {youtubeVerifyResult.message}
                    </Text>
                  </View>
                )}

                <TextInput
                  style={styles.modalInput}
                  placeholder="https://www.youtube.com/watch?v=..."
                  placeholderTextColor="#666"
                  value={modalInputUrl}
                  onChangeText={(t) => {
                    setModalInputUrl(t);
                    if (youtubeVerifyResult) setYoutubeVerifyResult(null);
                  }}
                  autoCapitalize="none"
                  keyboardType="url"
                />

                {youtubeVerifyResult?.success ? (
                  <TouchableOpacity
                    style={[styles.modalSubmitBtn, { backgroundColor: "#10b981" }]}
                    onPress={() => {
                      setModalInputUrl("");
                      setYoutubeVerifyResult(null);
                      setActiveModal("none");
                    }}
                  >
                    <Text style={styles.modalSubmitBtnText}>확인 (등록 완료)</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.modalSubmitBtn}
                    onPress={insertYoutube}
                    disabled={verifyingYoutube}
                  >
                    {verifyingYoutube ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <ActivityIndicator size="small" color="#fff" />
                        <Text style={styles.modalSubmitBtnText}>YouTube API 검증 중...</Text>
                      </View>
                    ) : (
                      <Text style={styles.modalSubmitBtnText}>YouTube 영상 등록하기</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* 3. 외부콘텐츠 모달 */}
            {activeModal === "external" && (
              <View>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitleText}>↗️ 외부콘텐츠 / iframe 삽입</Text>
                  <TouchableOpacity onPress={() => setActiveModal("none")}>
                    <Ionicons name="close" size={22} color="#aaa" />
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={[styles.modalInput, { height: 90 }]}
                  multiline
                  placeholder="<iframe ...> 또는 URL 주소 입력"
                  placeholderTextColor="#666"
                  value={modalInputUrl}
                  onChangeText={setModalInputUrl}
                />
                <TouchableOpacity style={styles.modalSubmitBtn} onPress={insertExternal}>
                  <Text style={styles.modalSubmitBtnText}>외부 콘텐츠 삽입</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* 4. 시리즈 모달 */}
            {activeModal === "series" && (
              <View>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitleText}>🩵 연관 시리즈 설정</Text>
                  <TouchableOpacity onPress={() => setActiveModal("none")}>
                    <Ionicons name="close" size={22} color="#aaa" />
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={styles.modalInput}
                  placeholder="시리즈 제목 (예: React 완벽 가이드)"
                  placeholderTextColor="#666"
                  value={modalTitle}
                  onChangeText={setModalTitle}
                />
                <TouchableOpacity style={styles.modalSubmitBtn} onPress={insertSeries}>
                  <Text style={styles.modalSubmitBtnText}>시리즈 태그 삽입</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* 5. 투표 생성 모달 */}
            {activeModal === "poll" && (
              <View>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitleText}>📊 투표 생성</Text>
                  <TouchableOpacity onPress={() => setActiveModal("none")}>
                    <Ionicons name="close" size={22} color="#aaa" />
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={styles.modalInput}
                  placeholder="투표 질문 입력"
                  placeholderTextColor="#666"
                  value={pollQuestion}
                  onChangeText={setPollQuestion}
                />
                {pollOptions.map((opt, idx) => (
                  <TextInput
                    key={idx}
                    style={[styles.modalInput, { marginTop: 6 }]}
                    placeholder={`옵션 ${idx + 1}`}
                    placeholderTextColor="#666"
                    value={opt}
                    onChangeText={(val) => {
                      const copy = [...pollOptions];
                      copy[idx] = val;
                      setPollOptions(copy);
                    }}
                  />
                ))}
                <TouchableOpacity
                  style={{ alignSelf: "flex-end", marginTop: 4 }}
                  onPress={() => setPollOptions([...pollOptions, `옵션 ${pollOptions.length + 1}`])}
                >
                  <Text style={{ color: "#3b82f6", fontSize: 13 }}>+ 옵션 추가</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSubmitBtn} onPress={insertPoll}>
                  <Text style={styles.modalSubmitBtnText}>투표 에디터에 생성</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* 6. AI 이미지 생성 모달 */}
            {activeModal === "ai" && (
              <View>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitleText}>🪄 AI 이미지 생성기</Text>
                  <TouchableOpacity onPress={() => setActiveModal("none")}>
                    <Ionicons name="close" size={22} color="#aaa" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.modalSubText}>생성하고 싶은 이미지 스타일이나 프롬프트를 선택해보세요.</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 10 }}>
                  {AI_PRESETS.map((preset, i) => (
                    <TouchableOpacity
                      key={i}
                      style={{
                        backgroundColor: "#334155",
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 16,
                        marginRight: 8,
                      }}
                      onPress={() => generateAiImage(preset.url)}
                    >
                      <Text style={{ color: "#f8fafc", fontSize: 13 }}>✨ {preset.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <TextInput
                  style={styles.modalInput}
                  placeholder="직접 프롬프트 입력 (예: 해질녘의 감성 카페)"
                  placeholderTextColor="#666"
                  value={aiPrompt}
                  onChangeText={setAiPrompt}
                />
                <TouchableOpacity
                  style={[styles.modalSubmitBtn, { backgroundColor: "#8b5cf6" }]}
                  onPress={() => generateAiImage()}
                  disabled={aiGenerating}
                >
                  <Text style={styles.modalSubmitBtnText}>
                    {aiGenerating ? "AI 이미지 생성 중..." : "AI 이미지 생성 및 삽입"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* 7. 링크 모달 */}
            {activeModal === "link" && (
              <View>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitleText}>🔗 하이퍼링크 삽입</Text>
                  <TouchableOpacity onPress={() => setActiveModal("none")}>
                    <Ionicons name="close" size={22} color="#aaa" />
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={styles.modalInput}
                  placeholder="표시할 텍스트 (선택)"
                  placeholderTextColor="#666"
                  value={modalTitle}
                  onChangeText={setModalTitle}
                />
                <TextInput
                  style={[styles.modalInput, { marginTop: 8 }]}
                  placeholder="https://example.com"
                  placeholderTextColor="#666"
                  value={modalInputUrl}
                  onChangeText={setModalInputUrl}
                />
                <TouchableOpacity style={styles.modalSubmitBtn} onPress={insertLink}>
                  <Text style={styles.modalSubmitBtnText}>링크 삽입</Text>
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  editorWrapper: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: "#e6e6e6",
    marginVertical: 10,
  },

  /* 툴바 1열 */
  toolbarRow1: {
    height: 44,
    backgroundColor: "#e0e0e0",
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  toolbarScroll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingRight: 10,
  },
  toolBtn1: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#bbb",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 4,
    gap: 4,
  },
  toolBtn1Text: {
    fontSize: 12,
    color: "#333",
    fontWeight: "600",
  },
  htmlCheckboxContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#bbb",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 4,
    marginLeft: "auto",
    gap: 5,
  },
  checkbox: {
    width: 14,
    height: 14,
    borderWidth: 1,
    borderColor: "#666",
    borderRadius: 2,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  checkboxChecked: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb",
  },
  htmlCheckboxLabel: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#333",
  },

  /* 툴바 2열 */
  toolbarRow2: {
    height: 38,
    backgroundColor: "#ebebeb",
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  dropdownBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    gap: 4,
  },
  dropdownBtnSmall: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    gap: 3,
  },
  dropdownText: {
    fontSize: 12,
    color: "#333",
  },
  separator: {
    width: 1,
    height: 18,
    backgroundColor: "#bbb",
    marginHorizontal: 4,
  },
  formatBtn: {
    width: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 3,
    flexDirection: "row",
  },
  formatBtnText: {
    fontSize: 13,
    color: "#222",
  },

  dropdownMenu: {
    position: "absolute",
    top: 80,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#bbb",
    borderRadius: 6,
    padding: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 8,
    zIndex: 999,
  },
  dropdownMenuItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },

  /* 어두운 캔버스 에디터 영역 */
  canvasContainer: {
    backgroundColor: "#1c1c1e",
    padding: 12,
  },
  canvasInput: {
    color: "#ffffff",
    fontSize: 14,
    lineHeight: 22,
    minHeight: 240,
    fontFamily: Platform.OS === "web" ? "monospace" : undefined,
  },
  visualInput: {
    color: "#ffffff",
    fontSize: 14,
    lineHeight: 22,
    minHeight: 100,
  },

  /* 모달 */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: "#26262a",
    borderRadius: 14,
    padding: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  modalTitleText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#f3f4f6",
  },
  modalSubText: {
    fontSize: 13,
    color: "#9ca3af",
    marginBottom: 10,
  },
  modalInput: {
    backgroundColor: "#18181b",
    borderWidth: 1,
    borderColor: "#3f3f46",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#fff",
    fontSize: 14,
    marginTop: 6,
  },
  modalSubmitBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 8,
    paddingVertical: 12,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 14,
  },
  modalSubmitBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },

  dcIconGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
    paddingVertical: 10,
  },
  dcIconItem: {
    width: 80,
    height: 70,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    padding: 4,
  },
  dcIconText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "bold",
    marginTop: 2,
  },
});
