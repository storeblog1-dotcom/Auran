import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import api from "../services/api";
import { getFullImageUrl } from "../config";
import { PostDetailModal } from "../components/PostDetailModal";

const { width, height } = Dimensions.get("window");
const DEVICE_ASPECT_RATIO = height / width;
const GRID_SIZE = width / 3;

export const HashtagScreen = ({ route, navigation }: any) => {
  const tagName = route.params?.tagName || route.params?.tag || "";

  const [posts, setPosts] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  const fetchHashtagPosts = async () => {
    if (!tagName) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const response = await api.get(`/tags/${encodeURIComponent(tagName)}/posts`);
      if (response.data) {
        setPosts(response.data.items || []);
        setTotal(response.data.total || (response.data.items?.length ?? 0));
      }
    } catch (error) {
      console.error("Failed to fetch hashtag posts", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHashtagPosts();
  }, [tagName]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchHashtagPosts();
  };

  const renderGridItem = ({ item }: { item: any }) => {
    const mainMedia = item.media && item.media.length > 0 ? item.media[0].media_url : null;
    const imageUrl = getFullImageUrl(mainMedia);

    return (
      <TouchableOpacity
        style={styles.gridItem}
        activeOpacity={0.8}
        onPress={() => {
          setSelectedPostId(item.id);
          setDetailModalVisible(true);
        }}
      >
        <Image source={{ uri: imageUrl }} style={styles.gridImage} resizeMode="cover" />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>#{tagName}</Text>
        <View style={{ width: 30 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0095f6" />
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          numColumns={3}
          renderItem={renderGridItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />
          }
          ListHeaderComponent={
            <View style={styles.tagHeader}>
              <View style={styles.iconCircle}>
                <Text style={styles.hashIcon}>#</Text>
              </View>
              <View style={styles.tagMeta}>
                <Text style={styles.tagName}>#{tagName}</Text>
                <Text style={styles.postCountText}>게시물 {total}개</Text>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyGridContainer}>
              <Text style={styles.emptyGridText}>#{tagName} 태그의 게시물이 없습니다.</Text>
            </View>
          }
        />
      )}

      <PostDetailModal
        visible={detailModalVisible}
        postId={selectedPostId}
        onClose={() => {
          setDetailModalVisible(false);
          setSelectedPostId(null);
        }}
        onPostUpdated={fetchHashtagPosts}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    height: 54,
    borderBottomWidth: 0.5,
    borderBottomColor: "#262626",
  },
  backBtn: {
    padding: 8,
  },
  backBtnText: {
    color: "#fff",
    fontSize: 22,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  tagHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderBottomWidth: 0.5,
    borderBottomColor: "#262626",
  },
  iconCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 1.5,
    borderColor: "#333",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#121212",
  },
  hashIcon: {
    color: "#fff",
    fontSize: 32,
    fontWeight: "700",
  },
  tagMeta: {
    marginLeft: 20,
  },
  tagName: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 4,
  },
  postCountText: {
    color: "#8e8e8e",
    fontSize: 14,
  },
  gridItem: {
    width: GRID_SIZE,
    height: GRID_SIZE * 1.25,
    padding: 2,
  },
  gridImage: {
    width: "100%",
    height: "100%",
    borderRadius: 6,
    backgroundColor: "#262626",
  },
  noMediaGrid: {
    backgroundColor: "#121212",
  },
  emptyGridContainer: {
    marginTop: 60,
    alignItems: "center",
  },
  emptyGridText: {
    color: "#8e8e8e",
    fontSize: 15,
  },
});
