import React from "react";
import { View, Image, StyleSheet, ViewStyle } from "react-native";

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
  const logoHeight = height || Math.round(fontSize * 2.2);
  const logoWidth = width || Math.round(logoHeight * 3.6);

  return (
    <View style={[styles.container, style]}>
      <Image
        source={require("../../assets/aura_n_logo.png")}
        style={{ width: logoWidth, height: logoHeight }}
        resizeMode="contain"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
  },
});

export default AuraLogoText;
