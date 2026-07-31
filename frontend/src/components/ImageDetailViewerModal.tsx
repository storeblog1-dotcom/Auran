import React, { useState, useEffect, useRef } from "react";
import {
  Modal,
  View,
  StyleSheet,
  Image,
  TouchableOpacity,
  Text,
  Dimensions,
  SafeAreaView,
  StatusBar,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
  PanResponder,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getFullImageUrl } from "../config";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface MediaItem {
  id?: string;
  media_url: string;
  detail_media_url?: string | null;
  media_type?: string;
}

interface ImageDetailViewerModalProps {
  visible: boolean;
  media: MediaItem[];
  initialIndex?: number;
  onClose: () => void;
}

interface ZoomableImageProps {
  uri: string;
  fallbackUri?: string;
  imageWidth: number;
  imageHeight: number;
  onZoomChange?: (zoomed: boolean) => void;
  onSwipe?: (dx: number, dy: number) => void;
}

export const ZoomableImage = ({
  uri,
  fallbackUri = uri,
  imageWidth,
  imageHeight,
  onZoomChange = () => {},
  onSwipe,
}: ZoomableImageProps) => {
  const [activeUri, setActiveUri] = useState(uri);
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const transformRef = useRef(transform);
  const onZoomChangeRef = useRef(onZoomChange);
  const onSwipeRef = useRef(onSwipe);
  const gestureStart = useRef({
    touchCount: 0,
    distance: 0,
    scale: 1,
    x: 0,
    y: 0,
    pageX: 0,
    pageY: 0,
    didPinch: false,
  });

  useEffect(() => {
    onZoomChangeRef.current = onZoomChange;
    onSwipeRef.current = onSwipe;
  }, [onZoomChange, onSwipe]);

  useEffect(() => {
    setActiveUri(uri);
    const reset = { scale: 1, x: 0, y: 0 };
    transformRef.current = reset;
    setTransform(reset);
    onZoomChangeRef.current(false);
  }, [uri, imageWidth, imageHeight]);

  const updateTransform = (next: { scale: number; x: number; y: number }) => {
    transformRef.current = next;
    setTransform(next);
    onZoomChangeRef.current(next.scale > 1.01);
  };

  const distanceBetween = (touches: any[]) => {
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const clampPosition = (x: number, y: number, scale: number) => {
    const maxX = Math.max(0, (imageWidth * scale - SCREEN_WIDTH) / 2);
    const maxY = Math.max(0, (imageHeight * scale - SCREEN_HEIGHT) / 2);
    return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
  };

  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (event) => {
      const touches = event.nativeEvent.touches;
      const current = transformRef.current;
      gestureStart.current = {
        touchCount: touches.length,
        distance: touches.length >= 2 ? distanceBetween(touches) : 0,
        scale: current.scale,
        x: current.x,
        y: current.y,
        pageX: touches[0]?.pageX || 0,
        pageY: touches[0]?.pageY || 0,
        didPinch: touches.length >= 2,
      };
    },
    onPanResponderMove: (event) => {
      const touches = event.nativeEvent.touches;
      if (touches.length >= 2) {
        gestureStart.current.didPinch = true;
        const currentDistance = distanceBetween(touches);
        if (gestureStart.current.touchCount < 2 || gestureStart.current.distance === 0) {
          gestureStart.current.touchCount = touches.length;
          gestureStart.current.distance = currentDistance;
          gestureStart.current.scale = transformRef.current.scale;
          gestureStart.current.x = transformRef.current.x;
          gestureStart.current.y = transformRef.current.y;
          gestureStart.current.didPinch = true;
          return;
        }
        const nextScale = Math.max(
          1,
          Math.min(4, gestureStart.current.scale * currentDistance / gestureStart.current.distance)
        );
        const position = clampPosition(transformRef.current.x, transformRef.current.y, nextScale);
        updateTransform({ scale: nextScale, ...position });
      } else if (touches.length === 1) {
        if (gestureStart.current.touchCount >= 2) {
          gestureStart.current.touchCount = 1;
          gestureStart.current.x = transformRef.current.x;
          gestureStart.current.y = transformRef.current.y;
          gestureStart.current.pageX = touches[0].pageX;
          gestureStart.current.pageY = touches[0].pageY;
          return;
        }
        if (transformRef.current.scale <= 1.01) return;
        const x = gestureStart.current.x + touches[0].pageX - gestureStart.current.pageX;
        const y = gestureStart.current.y + touches[0].pageY - gestureStart.current.pageY;
        const position = clampPosition(x, y, transformRef.current.scale);
        updateTransform({ scale: transformRef.current.scale, ...position });
      }
    },
    onPanResponderRelease: (_event, gesture) => {
      if (
        !gestureStart.current.didPinch &&
        transformRef.current.scale <= 1.01 &&
        onSwipeRef.current
      ) {
        onSwipeRef.current(gesture.dx, gesture.dy);
      }
      gestureStart.current.touchCount = 0;
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderTerminate: () => {
      gestureStart.current.touchCount = 0;
    },
    onShouldBlockNativeResponder: () => true,
  })).current;

  return (
    <View style={styles.zoomImageHolder}>
      <View style={styles.zoomGestureSurface} {...responder.panHandlers}>
        <Image
          source={{ uri: activeUri }}
          onError={() => {
            if (activeUri !== fallbackUri) setActiveUri(fallbackUri);
          }}
          style={{
            width: imageWidth,
            height: imageHeight,
            transform: [
              { translateX: transform.x },
              { translateY: transform.y },
              { scale: transform.scale },
            ],
          }}
          resizeMode="contain"
        />
      </View>
    </View>
  );
};

export const ImageDetailViewerModal: React.FC<ImageDetailViewerModalProps> = ({
  visible,
  media,
  initialIndex = 0,
  onClose,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [imageRatios, setImageRatios] = useState<{ [key: number]: number }>({});
  const listRef = useRef<FlatList<MediaItem>>(null);

  useEffect(() => {
    if (visible) {
      setCurrentIndex(initialIndex);
      // Fetch natural dimensions for each image to compute accurate aspect ratio
      media.forEach((item, index) => {
        const detailUri = getFullImageUrl(
          item.detail_media_url || item.media_url
        );
        const fallbackUri = getFullImageUrl(item.media_url);
        Image.getSize(
          detailUri,
          (width, height) => {
            if (width > 0 && height > 0) {
              setImageRatios((prev) => ({ ...prev, [index]: width / height }));
            }
          },
          () => Image.getSize(
            fallbackUri,
            (width, height) => {
              if (width > 0 && height > 0) {
                setImageRatios((prev) => ({ ...prev, [index]: width / height }));
              }
            },
            (error) => console.log("Error getting image size:", error),
          ),
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

  const handleMediaSwipe = (dx: number) => {
    if (Math.abs(dx) < 60) return;
    const nextIndex = dx < 0
      ? Math.min(media.length - 1, currentIndex + 1)
      : Math.max(0, currentIndex - 1);
    if (nextIndex === currentIndex) return;
    setCurrentIndex(nextIndex);
    listRef.current?.scrollToIndex({ index: nextIndex, animated: true });
  };

  const renderZoomableImage = (item: MediaItem, index: number) => {
    const fullUri = getFullImageUrl(
      item.detail_media_url || item.media_url
    );
    const fallbackUri = getFullImageUrl(item.media_url);
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
        <ZoomableImage
          uri={fullUri}
          fallbackUri={fallbackUri}
          imageWidth={imgWidth}
          imageHeight={imgHeight}
          onSwipe={(dx) => handleMediaSwipe(dx)}
        />
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
          ref={listRef}
          data={media}
          keyExtractor={(item, index) => item.id || `media-${index}`}
          horizontal
          scrollEnabled={false}
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
  zoomGestureSurface: {
    ...StyleSheet.absoluteFill,
    justifyContent: "center",
    alignItems: "center",
  },
});

export default ImageDetailViewerModal;
