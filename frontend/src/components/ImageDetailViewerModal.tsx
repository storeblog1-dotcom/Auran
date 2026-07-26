import React, { useState, useEffect, useRef } from "react";
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
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PanGestureHandler, PinchGestureHandler, State } from "react-native-gesture-handler";
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

export const ZoomableImage = ({ uri, imageWidth, imageHeight, onZoomChange = () => {} }: { uri: string; imageWidth: number; imageHeight: number; onZoomChange?: (zoomed: boolean) => void }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const currentScale = useRef(1);
  const panRef = useRef<any>(null);
  const pinchRef = useRef<any>(null);
  const panX = useRef(new Animated.Value(0)).current;
  const panY = useRef(new Animated.Value(0)).current;
  const offsetX = useRef(new Animated.Value(0)).current;
  const offsetY = useRef(new Animated.Value(0)).current;
  const currentOffset = useRef({ x: 0, y: 0 });
  const onPinchEvent = Animated.event([{ nativeEvent: { scale } }], { useNativeDriver: true });
  const onPanEvent = Animated.event([{ nativeEvent: { translationX: panX, translationY: panY } }], { useNativeDriver: true });

  const finishPinch = (event: any) => {
    if (event.nativeEvent.state === State.BEGAN || event.nativeEvent.state === State.ACTIVE) {
      onZoomChange(true);
      return;
    }
    if (event.nativeEvent.state !== State.END) return;
    const nextScale = Math.min(4, Math.max(1, currentScale.current * event.nativeEvent.scale));
    currentScale.current = nextScale;
    scale.setValue(nextScale);
    onZoomChange(nextScale > 1);
  };

  const finishPan = (event: any) => {
    if (event.nativeEvent.state !== State.END) return;
    currentOffset.current = {
      x: currentOffset.current.x + event.nativeEvent.translationX,
      y: currentOffset.current.y + event.nativeEvent.translationY,
    };
    offsetX.setValue(currentOffset.current.x);
    offsetY.setValue(currentOffset.current.y);
    panX.setValue(0);
    panY.setValue(0);
  };

  return (
    <PanGestureHandler ref={panRef} minPointers={1} maxPointers={1} shouldCancelWhenOutside={false} simultaneousHandlers={pinchRef} onGestureEvent={onPanEvent} onHandlerStateChange={finishPan}>
      <Animated.View style={styles.zoomImageHolder}>
        <PinchGestureHandler ref={pinchRef} simultaneousHandlers={panRef} onGestureEvent={onPinchEvent} onHandlerStateChange={finishPinch}>
          <Animated.View style={styles.zoomImageHolder}>
            <Animated.Image source={{ uri }} style={{ width: imageWidth, height: imageHeight, transform: [{ scale }, { translateX: Animated.add(offsetX, panX) }, { translateY: Animated.add(offsetY, panY) }] }} resizeMode="contain" />
          </Animated.View>
        </PinchGestureHandler>
        <View style={styles.zoomControls}>
          <TouchableOpacity style={styles.zoomButton} onPress={() => { const next = Math.min(4, currentScale.current + 0.5); currentScale.current = next; onZoomChange(true); Animated.spring(scale, { toValue: next, useNativeDriver: true }).start(); }}><Text style={styles.zoomButtonText}>+</Text></TouchableOpacity>
          <TouchableOpacity style={styles.zoomButton} onPress={() => { const next = Math.max(1, currentScale.current - 0.5); currentScale.current = next; onZoomChange(next > 1); Animated.spring(scale, { toValue: next, useNativeDriver: true }).start(); }}><Text style={styles.zoomButtonText}>−</Text></TouchableOpacity>
        </View>
      </Animated.View>
    </PanGestureHandler>
  );
};

export const ImageDetailViewerModal: React.FC<ImageDetailViewerModalProps> = ({
  visible,
  media,
  initialIndex = 0,
  onClose,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isZoomed, setIsZoomed] = useState(false);
  const [imageRatios, setImageRatios] = useState<{ [key: number]: number }>({});

  useEffect(() => {
    if (visible) {
      setCurrentIndex(initialIndex);
      setIsZoomed(false);
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
        <ZoomableImage uri={fullUri} imageWidth={imgWidth} imageHeight={imgHeight} onZoomChange={setIsZoomed} />
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
          scrollEnabled={!isZoomed}
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
  zoomImageHolder: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
  },
  zoomControls: {
    position: "absolute",
    right: 18,
    bottom: 28,
    gap: 10,
  },
  zoomButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  zoomButtonText: {
    color: "#fff",
    fontSize: 28,
    lineHeight: 30,
    fontWeight: "600",
  },
});

export default ImageDetailViewerModal;
