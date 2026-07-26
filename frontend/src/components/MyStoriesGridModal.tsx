import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  Image,
  FlatList,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { getFullImageUrl } from "../config";
import { useTheme } from "../context/ThemeContext";
import { StoryDetailModal } from "./StoryDetailModal";

const { width } = Dimensions.get("window");
const GRID_PADDING = 12;
const CARD_GAP = 10;
const CARD_WIDTH = (width - GRID_PADDING * 2 - CARD_GAP) / 2;
const CARD_HEIGHT = CARD_WIDTH * (16 / 9);

interface MyStoriesGridModalProps {
  visible: boolean;
  stories: any[];
  onClose: () => void;
  onPressCreateStory: () => void;
  onDeleteStory?: (storyId: string) => void;
}

export const MyStoriesGridModal: React.FC<MyStoriesGridModalProps> = ({
  visible,
  stories = [],
  onClose,
  onPressCreateStory,
  onDeleteStory,
}) => {
  const { colors } = useTheme();
  const [selectedStory, setSelectedStory] = useState<any | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  if (!visible) return null;

  // 0,0 위치에 + 추가 카드를 배치하고, 뒤이어 n,n 스토리들을 나열
  const gridData = [{ isAddCard: true }, ...stories];

  const handleOpenDetail = (story: any) => {
    setSelectedStory(story);
    setDetailVisible(true);
  };

  const renderGridItem = ({ item, index }: { item: any; index: number }) => {
    // 행렬 위치 계산 (2열 그리드 기준: row = Math.floor(index / 2), col = index % 2)
    const row = Math.floor(index / 2);
    const col = index % 2;

    // 0,0 위치: + 스토리 추가 카드
    if (item.isAddCard) {
      return (
        <TouchableOpacity
          style={[
            styles.card,
            styles.addCard,
            { backgroundColor: colors.bgInput, borderColor: colors.accentBlue },
          ]}
          onPress={() => {
            onClose();
            onPressCreateStory();
          }}
          activeOpacity={0.8}
        >
          <View style={[styles.addIconCircle, { backgroundColor: colors.accentBlue }]}>
            <Ionicons name="add" size={28} color="#ffffff" />
          </View>
          <Text style={[styles.addCardTitle, { color: colors.textPrimary }]}>스토리 추가</Text>
        </TouchableOpacity>
      );
    }

    // 스토리 카드
    const imageUrl = getFullImageUrl(item.media_url);

    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}
        onPress={() => handleOpenDetail(item)}
        activeOpacity={0.88}
      >
        <Image source={{ uri: imageUrl }} style={styles.cardImage} resizeMode="cover" />

        {/* 렌더링 오버레이 정보 */}
        <View style={styles.cardOverlay}>
          <View />
          <Text style={styles.timeBadge} numberOfLines={1}>
            {new Date(item.created_at).toLocaleDateString("ko-KR", {
              month: "numeric",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </View>

        {item.caption ? (
          <View style={styles.captionSnippetBox}>
            <Text style={styles.captionSnippetText} numberOfLines={1}>
              {item.caption}
            </Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.borderColor }]}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>내 스토리 ({stories.length})</Text>
          <TouchableOpacity
            onPress={() => {
              onClose();
              onPressCreateStory();
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="add-circle-outline" size={24} color={colors.accentBlue} />
          </TouchableOpacity>
        </View>

        {/* Grid List (0,0 박스 포함 스마트폰 비율 그리드) */}
        <FlatList
          data={gridData}
          keyExtractor={(item, index) => item.id || `grid_add_${index}`}
          numColumns={2}
          renderItem={renderGridItem}
          contentContainerStyle={styles.gridContent}
          columnWrapperStyle={styles.columnWrapper}
          showsVerticalScrollIndicator={false}
        />

        {/* 스토리 상세 페이지 Modal (사진 1등 -> 내용 2등) */}
        <StoryDetailModal
          visible={detailVisible}
          story={selectedStory}
          onClose={() => setDetailVisible(false)}
          onDeleteStory={onDeleteStory}
        />
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  gridContent: {
    padding: GRID_PADDING,
    paddingBottom: 40,
  },
  columnWrapper: {
    justifyContent: "space-between",
    marginBottom: CARD_GAP,
  },
  // 스마트폰 9:16 비율 그리드 카드
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    position: "relative",
  },
  // (0,0) 추가 전용 카드
  addCard: {
    justifyContent: "center",
    alignItems: "center",
    borderStyle: "dashed",
    borderWidth: 1.5,
  },
  addIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  addCardTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  matrixBadge: {
    fontSize: 11,
  },
  cardImage: {
    width: "100%",
    height: "100%",
  },
  cardOverlay: {
    position: "absolute",
    top: 8,
    left: 8,
    right: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  matrixBadgeOverlay: {
    backgroundColor: "rgba(0,0,0,0.65)",
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "bold",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: "hidden",
  },
  timeBadge: {
    backgroundColor: "rgba(0,0,0,0.65)",
    color: "#ffffff",
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: "hidden",
  },
  captionSnippetBox: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.65)",
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  captionSnippetText: {
    color: "#ffffff",
    fontSize: 11,
  },
});
