import React from "react";
import { StyleSheet, Text, View, Image, Platform, TextStyle, ViewStyle } from "react-native";
import { HashtagText } from "./HashtagText";
import { useTheme } from "../context/ThemeContext";

interface RichTextRendererProps {
  content: string;
  style?: TextStyle | ViewStyle;
  textStyle?: TextStyle;
}

export const RichTextRenderer: React.FC<RichTextRendererProps> = ({
  content,
  style,
  textStyle,
}) => {
  const { colors } = useTheme();

  if (!content) return null;

  // 본문 텍스트에서 유튜브 iframe 태그 제거 (홈피드 하단 VerifiedYouTubeCard 리스트 전용 표시)
  const cleanContent = content.replace(/<div[^>]*><iframe[^>]*youtube\.com\/embed[\s\S]*?<\/iframe><\/div>/gi, "").trim();

  const isHtml = /<[a-z][\s\S]*>/i.test(cleanContent);

  // Web 환경일 경우 dangerouslySetInnerHTML을 통해 서식과 스타일을 그대로 렌더링
  if (Platform.OS === "web" && isHtml) {
    return (
      <View style={style}>
        <div
          style={{
            color: colors.textPrimary,
            fontSize: "15px",
            lineHeight: "1.6",
            wordBreak: "break-word",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans KR', sans-serif",
          }}
          dangerouslySetInnerHTML={{ __html: cleanContent }}
        />
      </View>
    );
  }

  // 모바일이거나 일반 텍스트일 때 / 간단 태그 파싱 렌더링
  if (!isHtml) {
    return <HashtagText text={cleanContent} style={textStyle} />;
  }

  // 간단한 HTML 블록 파싱 (이미지, 텍스트)
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  const blocks: Array<{ type: "text" | "image"; value: string }> = [];
  let lastIdx = 0;
  let match;

  while ((match = imgRegex.exec(cleanContent)) !== null) {
    const textPart = cleanContent.substring(lastIdx, match.index);
    if (textPart) {
      blocks.push({ type: "text", value: textPart });
    }
    blocks.push({ type: "image", value: match[1] });
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < cleanContent.length) {
    blocks.push({ type: "text", value: cleanContent.substring(lastIdx) });
  }

  return (
    <View style={style}>
      {blocks.map((block, idx) => {
        if (block.type === "image") {
          return (
            <Image
              key={idx}
              source={{ uri: block.value }}
              style={{
                width: "100%",
                height: 240,
                borderRadius: 8,
                marginVertical: 6,
              }}
              resizeMode="cover"
            />
          );
        }

        // HTML 태그 제거 후 HashtagText 렌더링
        const strippedText = block.value.replace(/<[^>]+>/g, "").trim();
        if (!strippedText) return null;
        return <HashtagText key={idx} text={strippedText} style={textStyle} />;
      })}
    </View>
  );
};
