import { Image } from "react-native";

import { getFullImageUrl } from "../config";

const MAX_TRACKED_URLS = 120;
const MAX_CONCURRENT_PREFETCHES = 4;
const prefetchedUrls = new Set<string>();

export const prefetchPostImages = async (
  posts: any[],
  limit: number,
  variant: "feed" | "thumbnail" = "feed",
): Promise<void> => {
  const urls = posts
    .map((post) => {
      const media = post?.media?.[0];
      return variant === "thumbnail"
        ? media?.thumbnail_media_url || media?.media_url
        : media?.media_url;
    })
    .filter(Boolean)
    .map((url) => getFullImageUrl(url))
    .filter((url) => url && !prefetchedUrls.has(url))
    .slice(0, limit);

  if (!urls.length) return;
  urls.forEach((url) => prefetchedUrls.add(url));

  let cursor = 0;
  const worker = async () => {
    while (cursor < urls.length) {
      const url = urls[cursor];
      cursor += 1;
      try {
        const cached = await Image.prefetch(url);
        if (!cached) prefetchedUrls.delete(url);
      } catch {
        prefetchedUrls.delete(url);
      }
    }
  };
  await Promise.allSettled(
    Array.from(
      { length: Math.min(MAX_CONCURRENT_PREFETCHES, urls.length) },
      () => worker(),
    ),
  );

  while (prefetchedUrls.size > MAX_TRACKED_URLS) {
    const oldest = prefetchedUrls.values().next().value;
    if (!oldest) break;
    prefetchedUrls.delete(oldest);
  }
};
