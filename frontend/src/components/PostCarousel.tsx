import React, { useState } from "react";
import {
  View,
  StyleSheet,
  Image,
  FlatList,
  Dimensions,
  TouchableOpacity,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { getFullImageUrl } from "../config";
import { ImageDetailViewerModal } from "./ImageDetailViewerModal";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Card has marginHorizontal: 12 (left+right=24) and padding: 14 (left+right=28). Total offset = 52.
const CAROUSEL_ITEM_WIDTH = SCREEN_WIDTH - 52;
const DEFAULT_HEIGHT = CAROUSEL_ITEM_WIDTH * 1.28;

interface MediaItem {
  id?: string;
  media_url: string;
  media_type?: string;
  order?: number;
}

interface PostCarouselProps {
  media: MediaItem[];
  height?: number;
  onPress?: () => void;
  enableZoomViewer?: boolean;
}

export const PostCarousel: React.FC<PostCarouselProps> = ({
  media,
  height = DEFAULT_HEIGHT,
  onPress,
  enableZoomViewer = false,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isViewerVisible, setIsViewerVisible] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  if (!media || media.length === 0) return null;

  const handleImagePress = (index: number) => {
    if (onPress) onPress();
    if (enableZoomViewer) {
      setSelectedImageIndex(index);
      setIsViewerVisible(true);
    }
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffset = event.nativeEvent.contentOffset.x;
    const slide = Math.round(contentOffset / CAROUSEL_ITEM_WIDTH);
    if (slide !== activeIndex && slide >= 0 && slide < media.length) {
      setActiveIndex(slide);
    }
  };

  return (
    <>
      {enableZoomViewer && (
        <ImageDetailViewerModal
          visible={isViewerVisible}
          media={media}
          initialIndex={selectedImageIndex}
          onClose={() => setIsViewerVisible(false)}
        />
      )}

      {media.length === 1 ? (
        <TouchableOpacity
          style={styles.singleImageWrapper}
          activeOpacity={0.9}
          onPress={() => handleImagePress(0)}
        >
          <Image
            source={{ uri: getFullImageUrl(media[0].media_url) }}
            style={[styles.singleImage, { height }]}
            resizeMode="cover"
          />
        </TouchableOpacity>
      ) : (
        <View style={[styles.container, { height }]}>
          <FlatList
            data={media}
            keyExtractor={(item, index) => item.id || `media-${index}`}
            horizontal
            pagingEnabled
            nestedScrollEnabled
            decelerationRate="fast"
            snapToInterval={CAROUSEL_ITEM_WIDTH}
            snapToAlignment="center"
            showsHorizontalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            initialNumToRender={media.length}
            maxToRenderPerBatch={media.length}
            windowSize={5}
            getItemLayout={(_, index) => ({
              length: CAROUSEL_ITEM_WIDTH,
              offset: CAROUSEL_ITEM_WIDTH * index,
              index,
            })}
            renderItem={({ item, index }) => (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => handleImagePress(index)}
                style={{ width: CAROUSEL_ITEM_WIDTH, height, alignItems: "center", justifyContent: "center" }}
              >
                <Image
                  source={{ uri: getFullImageUrl(item.media_url) }}
                  style={[styles.carouselImage, { height }]}
                  resizeMode="cover"
                />
              </TouchableOpacity>
            )}
          />

          {/* Pagination Dots */}
          <View style={styles.paginationContainer}>
            {media.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === activeIndex ? styles.activeDot : styles.inactiveDot,
                ]}
              />
            ))}
          </View>
        </View>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    width: CAROUSEL_ITEM_WIDTH,
    position: "relative",
    backgroundColor: "#161622",
    marginVertical: 10,
    borderRadius: 18,
    overflow: "hidden",
    alignSelf: "center",
  },
  singleImageWrapper: {
    width: CAROUSEL_ITEM_WIDTH,
    marginVertical: 10,
    borderRadius: 18,
    overflow: "hidden",
    alignSelf: "center",
  },
  singleImage: {
    width: CAROUSEL_ITEM_WIDTH,
    borderRadius: 18,
    backgroundColor: "#161622",
  },
  carouselImage: {
    width: CAROUSEL_ITEM_WIDTH,
    borderRadius: 18,
    backgroundColor: "#161622",
  },
  paginationContainer: {
    position: "absolute",
    bottom: 12,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginHorizontal: 3,
  },
  activeDot: {
    backgroundColor: "#8b5cf6",
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  inactiveDot: {
    backgroundColor: "rgba(255, 255, 255, 0.5)",
  },
});

export default PostCarousel;
