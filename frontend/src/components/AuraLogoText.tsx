import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";

interface AuraLogoTextProps {
  width?: number;
  height?: number;
  fontSize?: number;
  style?: ViewStyle;
}

export const AuraLogoText: React.FC<AuraLogoTextProps> = ({
  width,
  height,
  fontSize = 28,
  style,
}) => {
  const logoHeight = height || Math.round(fontSize * 1.35);

  return (
    <View style={[styles.container, style]}>
      <Text style={[styles.logo, { fontSize, lineHeight: logoHeight }]}>
        <Text style={styles.aura}>aura</Text>
        <Text style={styles.plus}>+</Text>
        <Text style={styles.n}>n</Text>
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
  },
  logo: {
    fontWeight: "700",
    letterSpacing: -1.2,
  },
  aura: { color: "#7652df" },
  plus: { color: "#ec6db1" },
  n: { color: "#42b8d4" },
});

export default AuraLogoText;
