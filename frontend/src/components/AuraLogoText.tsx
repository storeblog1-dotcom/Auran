import React from "react";
import { Image, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { useTheme } from "../context/ThemeContext";

interface AuraLogoTextProps {
  width?: number;
  height?: number;
  fontSize?: number;
  style?: StyleProp<ViewStyle>;
}

const DARK_LOGO = require("../../assets/aura-logo-dark.png");
const LIGHT_LOGO = require("../../assets/aura-logo-light.png");
const LOGO_ASPECT_RATIO = 839 / 180;

export const AuraLogoText: React.FC<AuraLogoTextProps> = ({
  width,
  height,
  fontSize = 28,
  style,
}) => {
  const { isDark } = useTheme();
  const logoHeight = height || Math.round(fontSize * 1.35);
  const logoWidth = width || Math.round(logoHeight * LOGO_ASPECT_RATIO);

  return (
    <View style={[styles.container, { width: logoWidth, height: logoHeight }, style]}>
      <Image
        source={isDark ? DARK_LOGO : LIGHT_LOGO}
        style={styles.image}
        resizeMode="contain"
        accessibilityLabel="aura+n"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
  },
  image: {
    width: "100%",
    height: "100%",
  },
});

export default AuraLogoText;
