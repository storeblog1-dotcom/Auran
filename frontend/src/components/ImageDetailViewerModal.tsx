import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  StyleSheet,
  Image,
  TouchableOpacity,
  Text,
  Dimensions,
  ScrollView,
  SafeAreaView,
  StatusBar,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getFullImageUrl } from "../config";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface MediaItem {
  id?: string;
  media_url: string;
  media_type?: string;
}

interface ImageDetailViewerModalProps {
  visible: boolean;
  media: MediaItem[];
  initialIndex?: number;
  onClose: () => void;
}

export const ImageDetailViewerModal: React.FC<ImageDetailViewerModalProps> = ({
  visible,
  media,
  initialIndex = 0,
  onClose,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [imageRatios, setImageRatios] = useState<{ [key: number]: number }>({});

  useEffect(() => {
    if (visible) {
      setCurrentIndex(initialIndex);
      // Fetch natural dimensions for each image to compute accurate aspect ratio
      media.forEach((item, index) => {
        const fullUri = getFullImageUrl(item.media_url);
        Image.getSize(
          fullUri,
          (width, height) => {
            if (width > 0 && height > 0) {
              setImageRatios((prev) => ({ ...prev, [index]: width / height }));
            }
          },
          (error) => {
            console.log("Error getting image size:", error);
          }
        );
      });
    }
  }, [visible, initialIndex, media]);

  if (!visible || !media || media.length === 0) return null;

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffset = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffset / SCREEN_WIDTH);
    if (index !== currentIndex && index >= 0 && index < media.length) {
      setCurrentIndex(index);
    }
  };

  const renderZoomableImage = (item: MediaItem, index: number) => {
    const fullUri = getFullImageUrl(item.media_url);
    const ratio = imageRatios[index] || 1.0;

    // Calculate aspect ratio dimensions inside smartphone bounds (100% full screen area)
    let imgWidth = SCREEN_WIDTH;
    let imgHeight = SCREEN_WIDTH / ratio;

    const maxAllowedHeight = SCREEN_HEIGHT;
    if (imgHeight > maxAllowedHeight) {
      imgHeight = maxAllowedHeight;
      imgWidth = maxAllowedHeight * ratio;
    }

    return (
      <View key={item.id || `view-${index}`} style={styles.slideContainer}>
        <ScrollView
          style={styles.zoomScrollView}
          contentContainerStyle={styles.zoomScrollContent}
          minimumZoomScale={1}
          maximumZoomScale={4}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          bouncesZoom={true}
          centerContent={true}
        >
          <Image
            source={{ uri: fullUri }}
            style={{ width: imgWidth, height: imgHeight }}
            resizeMode="contain"
          />
        </ScrollView>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.container}>
        <StatusBar hidden barStyle="light-content" />

        {/* Top Floating Control Bar */}
        <SafeAreaView style={styles.topBarContainer}>
          <View style={styles.topBar}>
            <Text style={styles.counterText}>
              {media.length > 1 ? `${currentIndex + 1} / ${media.length}` : ""}
            </Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.8}>
              <Ionicons name="close" size={28} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        {/* Swipable & Zoomable Image Slider */}
        <FlatList
          data={media}
          keyExtractor={(item, index) => item.id || `media-${index}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, index) => ({
            length: SCREEN_WIDTH,
            offset: SCREEN_WIDTH * index,
            index,
          })}
          renderItem={({ item, index }) => renderZoomableImage(item, index)}
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  topBarContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 10,
    backgroundColor: "transparent",
  },
  counterText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 1,
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "center",
    alignItems: "center",
  },
  slideContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000000",
  },
  zoomScrollView: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  zoomScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});

export default ImageDetailViewerModal;
