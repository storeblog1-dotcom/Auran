import React from "react";
import { Platform, Text, TextStyle, StyleProp } from "react-native";
import NativeMessageTextComponent from "./NativeMessageTextNativeComponent";

export interface NativeMessageTextProps {
  text: string;
  color?: string;
  fontSize?: number;
  lineHeight?: number;
  selectable?: boolean;
  maxLines?: number;
  includeFontPadding?: boolean;
  breakStrategy?: "simple" | "highQuality" | "balanced";
  hyphenationFrequency?: "none" | "normal" | "full";
  style?: StyleProp<TextStyle>;
  fallbackStyle?: StyleProp<TextStyle>;
}

export const NativeMessageText: React.FC<NativeMessageTextProps> = ({
  text,
  color,
  fontSize = 15,
  lineHeight,
  selectable = false,
  maxLines,
  includeFontPadding = true,
  breakStrategy = "simple",
  hyphenationFrequency = "none",
  style,
  fallbackStyle,
}) => {
  if (Platform.OS !== "android") {
    return (
      <Text style={[fallbackStyle || style, color ? { color } : undefined]}>
        {text}
      </Text>
    );
  }

  return (
    <NativeMessageTextComponent
      text={text}
      color={color}
      fontSize={fontSize}
      lineHeight={lineHeight}
      selectable={selectable}
      maxLines={maxLines}
      includeFontPadding={includeFontPadding}
      breakStrategy={breakStrategy}
      hyphenationFrequency={hyphenationFrequency}
      style={style}
    />
  );
};

export default NativeMessageText;
