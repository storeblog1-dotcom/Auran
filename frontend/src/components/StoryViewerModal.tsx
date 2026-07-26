import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  Modal,
  Image,
  TouchableOpacity,
  Dimensions,
  Animated,
  Alert,
  Platform,
  PanResponder,
  FlatList,
  ScrollView,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import api from "../services/api";
import { getFullImageUrl } from "../config";
import { ZoomableImage } from "./ImageDetailViewerModal";

const { width, height } = Dimensions.get("window");
const STORY_DURATION = 5000; // 5초
const SWIPE_THRESHOLD = 60; // 스와이프 인식 최소 거리

interface StoryViewerModalProps {
  visible: boolean;
  storyGroups: any[];
  initialGroupIndex: number;
  onClose: () => void;
  onStoryViewed?: (storyId: string) => void;
  onStoryDeleted?: (storyId: string) => void;
}

export const StoryViewerModal: React.FC<StoryViewerModalProps> = ({
  visible,
  storyGroups,
  initialGroupIndex,
  onClose,
  onStoryViewed,
  onStoryDeleted,
}) => {
  const [groupIndex, setGroupIndex] = useState(initialGroupIndex);
  const [storyIndex, setStoryIndex] = useState(0);
  const [gridVisible, setGridVisible] = useState(false);

  // stale closure 방지용 refs
  const groupIndexRef = useRef(initialGroupIndex);
  const storyIndexRef = useRef(0);
  const storyGroupsRef = useRef(storyGroups);

  useEffect(() => { groupIndexRef.current = groupIndex; }, [groupIndex]);
  useEffect(() => { storyIndexRef.current = storyIndex; }, [storyIndex]);
  useEffect(() => { storyGroupsRef.current = storyGroups; }, [storyGroups]);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);

  // visible/initialGroupIndex 변경 시 초기화
  useEffect(() => {
    if (visible) {
      setGroupIndex(initialGroupIndex);
      setStoryIndex(0);
      setGridVisible(false);
    }
  }, [visible, initialGroupIndex]);

  const currentGroup = storyGroups[groupIndex];
  const currentStory = currentGroup?.stories?.[storyIndex];

  const handleNextStory = useCallback(
    (fromAutoTimer: boolean = false) => {
      if (!currentGroup) return;
      if (storyIndex < currentGroup.stories.length - 1) {
        setStoryIndex((prev) => prev + 1);
      } else if (groupIndex < storyGroups.length - 1) {
        setGroupIndex((prev) => prev + 1);
        setStoryIndex(0);
      } else {
        if (!fromAutoTimer) {
          onClose();
        }
      }
    },
    [currentGroup, storyIndex, groupIndex, storyGroups.length, onClose]
  );

  const handlePrevStory = useCallback(() => {
    if (storyIndex > 0) {
      setStoryIndex((prev) => prev - 1);
    } else if (groupIndex > 0) {
      const prevGroup = storyGroups[groupIndex - 1];
      setGroupIndex((prev) => prev - 1);
      setStoryIndex(prevGroup.stories.length - 1);
    }
    // 더 이상 이전이 없어도 닫지 않음
  }, [storyIndex, groupIndex, storyGroups]);

  // 스와이프 제스처
  // 좌우 스와이프 → 다른 유저 그룹 이동
  // 상하 스와이프 → 같은 유저의 다음/이전 스토리 이동
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => {
        return Math.abs(gs.dx) > 12 || Math.abs(gs.dy) > 12;
      },
      onPanResponderRelease: (_, gs) => {
        const absX = Math.abs(gs.dx);
        const absY = Math.abs(gs.dy);
        const groups = storyGroupsRef.current;
        const gIdx = groupIndexRef.current;
        const sIdx = storyIndexRef.current;

        if (absX > absY && absX > SWIPE_THRESHOLD) {
          if (gs.dx < 0) {
            // 왼쪽 → 다음 그룹
            if (gIdx + 1 < groups.length) {
              setStoryIndex(0);
              setGroupIndex(gIdx + 1);
            }
          } else {
            // 오른쪽 → 이전 그룹
            if (gIdx - 1 >= 0) {
              setStoryIndex(0);
              setGroupIndex(gIdx - 1);
            }
          }
        } else if (absY > absX && absY > SWIPE_THRESHOLD) {
          const group = groups[gIdx];
          if (!group) return;
          if (gs.dy < 0) {
            // 위 → 다음 스토리
            if (sIdx < group.stories.length - 1) setStoryIndex(sIdx + 1);
          } else {
            // 아래 → 이전 스토리
            if (sIdx > 0) setStoryIndex(sIdx - 1);
          }
        }
      },
    })
  ).current;

  // 스토리 변경 시 타이머 + 읽음 처리
  useEffect(() => {
    if (!visible || !currentStory || gridVisible) return;

    const markViewed = async () => {
      try {
        await api.post(`/stories/${currentStory.id}/view`);
        if (onStoryViewed) {
          onStoryViewed(currentStory.id);
        }
      } catch (err) {
        console.log("Error marking story viewed", err);
      }
    };
    markViewed();

    progressAnim.setValue(0);
    const animation = Animated.timing(progressAnim, {
      toValue: 1,
      duration: STORY_DURATION,
      useNativeDriver: false,
    });
    animationRef.current = animation;

    animation.start(({ finished }) => {
      if (finished) {
        handleNextStory(true);
      }
    });

    return () => {
      animation.stop();
    };
  }, [visible, groupIndex, storyIndex, handleNextStory, gridVisible]);

  const handleDeleteStory = useCallback(async () => {
    if (!currentStory) return;
    Alert.alert("스토리 삭제", "이 스토리를 삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/stories/${currentStory.id}`);
            if (onStoryDeleted) {
              onStoryDeleted(currentStory.id);
            }
            if (currentGroup && currentGroup.stories.length <= 1) {
              onClose();
            } else {
              handleNextStory(false);
            }
          } catch (err) {
            console.log("Error deleting story", err);
            Alert.alert("오류", "스토리 삭제에 실패했습니다.");
          }
        },
      },
    ]);
  }, [currentStory, currentGroup, onStoryDeleted, onClose, handleNextStory]);

  if (!visible || !currentGroup || !currentStory) {
    return null;
  }

  const user = currentGroup.user;
  const isSelf = currentGroup.is_self;

  const getFormattedTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) {
      const diffMins = Math.max(1, Math.floor(diffMs / (1000 * 60)));
      return `${diffMins}분 전`;
    }
    if (diffHours < 24) return `${diffHours}시간 전`;
    return `${Math.floor(diffHours / 24)}일 전`;
  };

  // ── 그리드 오버레이 ──
  const GridOverlay = () => {
    // 현재 그룹의 모든 스토리를 그리드로 표시
    const stories = currentGroup.stories;
    const COLS = 3;
    const cardW = (width - 4 * 6) / COLS;
    const cardH = cardW * (16 / 9);

    return (
      <View style={styles.gridOverlay}>
        <SafeAreaView style={{ flex: 1 }}>
          {/* 그리드 헤더 */}
          <View style={styles.gridHeader}>
            <Text style={styles.gridTitle}>{user.username}의 스토리</Text>
            <TouchableOpacity onPress={() => setGridVisible(false)} style={styles.iconBtn}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.gridContent}>
            <View style={styles.gridRow}>
              {stories.map((s: any, idx: number) => (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.gridCard, { width: cardW, height: cardH }]}
                  onPress={() => {
                    setStoryIndex(idx);
                    setGridVisible(false);
                  }}
                  activeOpacity={0.85}
                >
                  <Image
                    source={{ uri: getFullImageUrl(s.media_url) }}
                    style={styles.gridCardImage}
                    resizeMode="cover"
                  />
                  {idx === storyIndex && (
                    <View style={styles.gridCardActive} />
                  )}
                  <Text style={styles.gridCardTime} numberOfLines={1}>
                    {getFormattedTime(s.created_at)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <StatusBar hidden />
        {/* 배경 이미지 — 풀스크린 */}
        <ZoomableImage
          uri={getFullImageUrl(currentStory.media_url)}
          imageWidth={width}
          imageHeight={height}
        />

        {/* 어두운 오버레이 */}
        <View style={styles.overlay} />

        <SafeAreaView style={styles.safeArea}>
          {/* 프로그래스 바 */}
          <View style={styles.progressContainer}>
            {currentGroup.stories.map((s: any, idx: number) => {
              let fillWidth: any = "0%";
              if (idx < storyIndex) {
                fillWidth = "100%";
              } else if (idx === storyIndex) {
                fillWidth = progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0%", "100%"],
                });
              }
              return (
                <View key={s.id} style={styles.progressTrack}>
                  <Animated.View style={[styles.progressFill, { width: fillWidth }]} />
                </View>
              );
            })}
          </View>

          {/* 유저 헤더 */}
          <View style={styles.header}>
            <View style={styles.userInfo}>
              {user.profile_image_url ? (
                <Image
                  source={{ uri: getFullImageUrl(user.profile_image_url) }}
                  style={styles.avatar}
                />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Text style={styles.avatarInitial}>
                    {user.username ? user.username[0].toUpperCase() : "?"}
                  </Text>
                </View>
              )}
              <View>
                <Text style={styles.username}>{user.username}</Text>
                <Text style={styles.timeText}>
                  {getFormattedTime(currentStory.created_at)}
                </Text>
              </View>
            </View>

            <View style={styles.headerActions}>
              {isSelf && (
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={handleDeleteStory}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="trash-outline" size={20} color="#fff" />
                </TouchableOpacity>
              )}
              {/* 그리드 아이콘 */}
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => setGridVisible(true)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="grid-outline" size={22} color="#fff" />
              </TouchableOpacity>
              {/* 닫기 버튼 */}
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={onClose}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* 제스처 레이어 — 헤더/푸터 아래, 배경 위 */}
          <View
            style={styles.gestureLayer}
            {...panResponder.panHandlers}
          />

          {/* 하단 영역 */}
          <View style={styles.footer}>
            <View style={styles.bottomGradient} />
            {currentStory.caption ? (
              <Text style={styles.captionText}>{currentStory.caption}</Text>
            ) : null}
            {isSelf && (
              <View style={styles.viewsRow}>
                <Ionicons name="eye-outline" size={16} color="#fff" style={{ marginRight: 4 }} />
                <Text style={styles.viewsText}>
                  {currentStory.views_count || 0}명이 봤어요
                </Text>
              </View>
            )}
            {/* 그룹 네비게이션 도트 */}
            {storyGroups.length > 1 && (
              <View style={styles.groupIndicator}>
                {storyGroups.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.groupDot,
                      i === groupIndex && styles.groupDotActive,
                    ]}
                  />
                ))}
              </View>
            )}
          </View>
        </SafeAreaView>
      </View>

      {/* 그리드 오버레이 (별도 Modal 레이어) */}
      {gridVisible && <GridOverlay />}
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  backgroundImage: {
    position: "absolute",
    top: 0,
    left: 0,
    width: width,
    height: height,
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    width: width,
    height: height,
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  safeArea: {
    flex: 1,
  },
  progressContainer: {
    flexDirection: "row",
    paddingHorizontal: 10,
    paddingTop: Platform.OS === "android" ? 36 : 8,
    gap: 3,
    zIndex: 10,
  },
  progressTrack: {
    flex: 1,
    height: 2.5,
    backgroundColor: "rgba(255,255,255,0.35)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#fff",
    borderRadius: 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    zIndex: 10,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#333",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.5)",
  },
  avatarPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#555",
  },
  avatarInitial: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 15,
  },
  username: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  timeText: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 11,
    marginTop: 1,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  iconBtn: {
    padding: 8,
  },
  gestureLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 6,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 40,
    zIndex: 10,
  },
  bottomGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 200,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  captionText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "500",
    textAlign: "center",
    marginBottom: 12,
    lineHeight: 22,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    zIndex: 1,
  },
  viewsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: 10,
    zIndex: 1,
  },
  viewsText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontWeight: "600",
  },
  groupIndicator: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
    marginTop: 6,
    zIndex: 1,
  },
  groupDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  groupDotActive: {
    backgroundColor: "#fff",
    width: 18,
  },
  // ── 그리드 오버레이 ──
  gridOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.92)",
    zIndex: 100,
  },
  gridHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(255,255,255,0.15)",
  },
  gridTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  gridContent: {
    padding: 6,
  },
  gridRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  gridCard: {
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#222",
    position: "relative",
  },
  gridCardImage: {
    width: "100%",
    height: "100%",
  },
  gridCardActive: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 2.5,
    borderColor: "#E1306C",
    borderRadius: 8,
  },
  gridCardTime: {
    position: "absolute",
    bottom: 5,
    left: 5,
    right: 5,
    color: "#fff",
    fontSize: 10,
    fontWeight: "600",
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
