import { memo, useMemo } from "react";
import { Platform, Text, View, useWindowDimensions } from "react-native";
import { Canvas, FontWeight, Paragraph, Skia } from "@shopify/react-native-skia";

type SkiaAppTextProps = {
  children: string;
  color: string;
  fontSize?: number;
  lineHeight?: number;
  fontWeight?: 400 | 500 | 700;
  systemBold?: boolean;
  maxWidth: number;
  accessibilityLabel?: string;
  testID?: string;
};

const skiaFontWeights: Record<400 | 500 | 700, FontWeight> = {
  400: FontWeight.Normal,
  500: FontWeight.Medium,
  700: FontWeight.Bold,
};

function SkiaAppTextComponent({
  children,
  color,
  fontSize = 15,
  lineHeight = 22,
  fontWeight,
  systemBold = false,
  maxWidth,
  accessibilityLabel,
  testID,
}: SkiaAppTextProps) {
  const { fontScale } = useWindowDimensions();
  const scaledFontSize = fontSize * fontScale;
  const scaledLineHeight = lineHeight * fontScale;
  const resolvedWeight = fontWeight ?? (systemBold ? 700 : 400);

  const paragraph = useMemo(() => {
    if (Platform.OS !== "android" || maxWidth <= 0) {
      return null;
    }

    const value = Skia.ParagraphBuilder.Make()
      .pushStyle({
        color: Skia.Color(color),
        fontSize: scaledFontSize,
        heightMultiplier: scaledLineHeight / scaledFontSize,
        fontStyle: { weight: skiaFontWeights[resolvedWeight] },
      })
      .addText(children)
      .pop()
      .build();

    value.layout(maxWidth);
    return value;
  }, [children, color, maxWidth, resolvedWeight, scaledFontSize, scaledLineHeight]);

  if (Platform.OS !== "android") {
    return (
      <Text
        accessibilityLabel={accessibilityLabel ?? children}
        testID={testID}
        style={{ color, fontSize, lineHeight }}
      >
        {children}
      </Text>
    );
  }

  if (!paragraph) {
    return null;
  }

  const paragraphHeight = Math.ceil(paragraph.getHeight());
  const paragraphWidth = Math.max(
    1,
    Math.min(maxWidth, Math.ceil(paragraph.getLongestLine())),
  );

  if (paragraphHeight <= 0) {
    return null;
  }

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? children}
      testID={testID}
    >
      <Canvas style={{ width: paragraphWidth, height: paragraphHeight }}>
        <Paragraph paragraph={paragraph} x={0} y={0} width={maxWidth} />
      </Canvas>
    </View>
  );
}

export const SkiaAppText = memo(SkiaAppTextComponent);
