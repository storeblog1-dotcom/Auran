import React, { useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import api from "../services/api";
import { getFullImageUrl } from "../config";
import { useTheme } from "../context/ThemeContext";
import { PostDetailModal } from "../components/PostDetailModal";
import { getDisplayName } from "../utils/displayName";
import {
  AdminAvatar,
  AdminBadge,
  openUserProfile,
} from "../components/AdminIdentity";

const { width, height } = Dimensions.get("window");
const DEVICE_ASPECT_RATIO = height / width;
const GRID_SIZE = width / 3;

export const SearchScreen = ({ navigation }: any) => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [explorePosts, setExplorePosts] = useState<any[]>([]);
  const [loadingExplore, setLoadingExplore] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Detail Modal State
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  const fetchExplorePosts = async () => {
    setLoadingExplore(true);
    try {
      const response = await api.get("/posts/explore");
      if (response.data && response.data.data) {
        const shuffled = [...response.data.data].sort(() => Math.random() - 0.5);
        setExplorePosts(shuffled);
      }
    } catch (err) {
      console.log("Error fetching explore posts", err);
    } finally {
      setLoadingExplore(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchExplorePosts();
    }, [])
  );

  const [searchTab, setSearchTab] = useState<"users" | "hashtags">("users");
  const [hashtagResults, setHashtagResults] = useState<any[]>([]);

  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([]);
      setHashtagResults([]);
      return;
    }

    const timer = setTimeout(() => {
      if (searchTab === "users") {
        searchUsers(query.trim());
      } else {
        searchHashtags(query.trim());
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, searchTab]);

  const searchUsers = async (q: string) => {
    setLoadingSearch(true);
    try {
      const response = await api.get(`/users/search?q=${encodeURIComponent(q)}`);
      if (response.data && response.data.data) {
        setSearchResults(response.data.data);
      }
    } catch (err) {
      console.log("Error searching users", err);
    } finally {
      setLoadingSearch(false);
    }
  };

  const searchHashtags = async (q: string) => {
    setLoadingSearch(true);
    try {
      const cleanQ = q.replace(/^#/, "");
      const response = await api.get(`/tags/search?q=${encodeURIComponent(cleanQ)}`);
      if (response.data) {
        setHashtagResults(Array.isArray(response.data) ? response.data : response.data.data || []);
      }
    } catch (err) {
      console.log("Error searching hashtags", err);
    } finally {
      setLoadingSearch(false);
    }
  };

  const handleToggleFollow = async (username: string, currentIsFollowing: boolean) => {
    // Optimistic UI update
    setSearchResults((prev) =>
      prev.map((u) => (u.username === username ? { ...u, is_following: !currentIsFollowing } : u))
    );

    try {
      let response;
      if (currentIsFollowing) {
        response = await api.delete(`/users/${username}/follow`);
      } else {
        response = await api.post(`/users/${username}/follow`);
      }
      const confirmedIsFollowing =
        response.data?.data?.is_following ?? !currentIsFollowing;
      setSearchResults((prev) =>
        prev.map((u) =>
          u.username === username
            ? { ...u, is_following: confirmedIsFollowing }
            : u
        )
      );
    } catch (err) {
      console.log("Error toggling follow", err);
      searchUsers(query);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchExplorePosts();
  };

  const renderSearchResultItem = ({ item }: { item: any }) => {
    return (
      <View style={[styles.userCard, { borderBottomColor: colors.borderColor }]}>
        <TouchableOpacity
          style={styles.userLeft}
          activeOpacity={0.7}
          onPress={() => openUserProfile(navigation, item)}
        >
          <AdminAvatar user={item} style={styles.userAvatar} />
          <View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={[styles.userUsername, { color: colors.textPrimary }]}>{getDisplayName(item)}</Text>
              {item.is_admin && <AdminBadge />}
            </View>
            <Text style={[styles.userFullName, { color: colors.textSecondary }]}>{item.full_name}</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.followBtn, item.is_following && [styles.followingBtn, { backgroundColor: colors.bgInput, borderColor: colors.borderColor, borderWidth: 1 }]]}
          onPress={() => handleToggleFollow(item.username, item.is_following)}
        >
          <Text style={[styles.followBtnText, item.is_following && { color: colors.textPrimary }]}>
            {item.is_following ? "팔로잉" : "팔로우"}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderHashtagResultItem = ({ item }: { item: any }) => {
    return (
      <TouchableOpacity
        style={[styles.hashtagCard, { borderBottomColor: colors.borderColor }]}
        activeOpacity={0.7}
        onPress={() => navigation.navigate("Hashtag", { tag: item.name })}
      >
        <View style={[styles.hashtagIconBox, { backgroundColor: colors.bgInput, borderColor: colors.borderColor, borderWidth: 1 }]}>
          <Text style={[styles.hashtagIconText, { color: colors.accentBlue }]}>#</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.hashtagNameText, { color: colors.textPrimary }]}>#{item.name}</Text>
          <Text style={[styles.hashtagCountText, { color: colors.textSecondary }]}>
            게시물 {item.posts_count || 0}개
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </TouchableOpacity>
    );
  };

  const renderExploreGridItem = ({ item }: { item: any }) => {
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
        <Image
          source={{ uri: imageUrl }}
          style={[styles.gridImage, { backgroundColor: colors.bgCard }]}
          resizeMode="cover"
        />
      </TouchableOpacity>
    );
  };

  const isSearchMode = query.trim().length > 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.bgPrimary, paddingTop: insets.top }]}>
      {/* Search Header Bar */}
      <View style={[styles.searchHeader, { backgroundColor: colors.headerBg, borderBottomColor: colors.borderColor }]}>
        <View style={[styles.searchBar, { backgroundColor: colors.bgInput, borderColor: colors.borderColor }]}>
          <Ionicons name="search-outline" size={18} color={colors.textSecondary} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder="검색"
            placeholderTextColor={colors.textSecondary}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
          />
          {query.length > 0 ? (
            <TouchableOpacity onPress={() => setQuery("")} style={styles.clearBtn}>
              <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Tab Switcher for Search Mode */}
      {isSearchMode && (
        <View style={[styles.searchTabRow, { borderBottomColor: colors.borderColor }]}>
          <TouchableOpacity
            style={[styles.searchTabItem, searchTab === "users" && [styles.searchTabActive, { borderBottomColor: colors.textPrimary }]]}
            onPress={() => setSearchTab("users")}
          >
            <Text style={[styles.searchTabText, { color: searchTab === "users" ? colors.textPrimary : colors.textMuted }]}>
              계정
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.searchTabItem, searchTab === "hashtags" && [styles.searchTabActive, { borderBottomColor: colors.textPrimary }]]}
            onPress={() => setSearchTab("hashtags")}
          >
            <Text style={[styles.searchTabText, { color: searchTab === "hashtags" ? colors.textPrimary : colors.textMuted }]}>
              태그
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {isSearchMode ? (
        loadingSearch ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.accentBlue} />
          </View>
        ) : searchTab === "users" ? (
          <FlatList
            key="search_list_users"
            data={searchResults}
            keyExtractor={(item) => item.id}
            renderItem={renderSearchResultItem}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>계정 검색 결과가 없습니다.</Text>
              </View>
            }
          />
        ) : (
          <FlatList
            key="search_list_hashtags"
            data={hashtagResults}
            keyExtractor={(item) => item.id || item.name}
            renderItem={renderHashtagResultItem}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>해시태그 검색 결과가 없습니다.</Text>
              </View>
            }
          />
        )
      ) : loadingExplore ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accentBlue} />
        </View>
      ) : (
        <FlatList
          key="explore_grid"
          data={explorePosts}
          keyExtractor={(item) => item.id}
          numColumns={3}
          renderItem={renderExploreGridItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textPrimary} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>탐색 피드 게시물이 없습니다.</Text>
            </View>
          }
        />
      )}

      {/* Post Detail Modal */}
      <PostDetailModal
        visible={detailModalVisible}
        postId={selectedPostId}
        onClose={() => {
          setDetailModalVisible(false);
          setSelectedPostId(null);
        }}
        onPostUpdated={fetchExplorePosts}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  searchHeader: {
    height: 52,
    justifyContent: "center",
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: "#262626",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#262626",
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    paddingVertical: 6,
    lineHeight: 20,
  },
  clearBtn: {
    padding: 4,
  },
  clearBtnText: {
    color: "#8e8e8e",
    fontSize: 14,
    fontWeight: "bold",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  userLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  userAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  userUsername: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 15,
  },
  userFullName: {
    color: "#8e8e8e",
    fontSize: 13,
    marginTop: 2,
  },
  followBtn: {
    backgroundColor: "#0095f6",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  followingBtn: {
    backgroundColor: "#262626",
  },
  followBtnText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 13,
  },
  followingBtnText: {
    color: "#fff",
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
    backgroundColor: "#1c1c1e",
  },
  noMediaGrid: {
    backgroundColor: "#333",
  },
  searchTabRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
  },
  searchTabItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  searchTabActive: {
    borderBottomWidth: 2,
  },
  searchTabText: {
    fontSize: 14,
    fontWeight: "bold",
  },
  hashtagCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  hashtagIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  hashtagIconText: {
    fontSize: 20,
    fontWeight: "bold",
  },
  hashtagNameText: {
    fontSize: 15,
    fontWeight: "bold",
  },
  hashtagCountText: {
    fontSize: 12,
    marginTop: 2,
  },
  emptyContainer: {
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 60,
  },
  emptyText: {
    color: "#8e8e8e",
    fontSize: 15,
    textAlign: "center",
    paddingHorizontal: 20,
    width: "100%",
    lineHeight: 22,
  },
});
