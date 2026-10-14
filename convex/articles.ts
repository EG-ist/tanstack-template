import {
  action,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";

const IMAGE_DOWNLOAD_TIMEOUT_MS = 15_000;

const articleStatus = v.union(v.literal("publish"), v.literal("draft"));

// Public URL of an image stored by `ingest` (served by convex/http.ts)
function blogImageUrl(filename: string) {
  return `${process.env.CONVEX_SITE_URL}/blog-images/${encodeURIComponent(filename)}`;
}

function replaceUrl(text: string, from: string, to: string) {
  // HTML may carry the URL with `&` escaped as `&amp;`
  return text
    .replaceAll(from, to)
    .replaceAll(from.replaceAll("&", "&amp;"), to.replaceAll("&", "&amp;"));
}

async function downloadImage(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.blob();
  } finally {
    clearTimeout(timeout);
  }
}

// Saves an article from RankGPT: copies its images into Convex storage,
// points the content at the copies, and upserts the article by RankGPT id.
// Public so the site's webhook route can call it, hence the secret check.
export const ingest = action({
  args: {
    secret: v.string(),
    article: v.object({
      externalId: v.string(),
      title: v.string(),
      slug: v.string(),
      metaDescription: v.optional(v.string()),
      contentHtml: v.string(),
      contentMarkdown: v.string(),
      heroImageUrl: v.optional(v.string()),
      heroImageAlt: v.optional(v.string()),
      images: v.array(v.object({ url: v.string(), filename: v.string() })),
      language: v.string(),
      status: articleStatus,
      publishedAt: v.string(),
    }),
  },
  handler: async (ctx, { secret, article }): Promise<{ slug: string }> => {
    const expected = process.env.RANKGPT_WEBHOOK_SECRET;
    if (!expected || secret !== expected) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const { images, ...fields } = article;
    const downloads = await Promise.allSettled(
      images.map(async (image) => ({
        ...image,
        storageId: await ctx.storage.store(await downloadImage(image.url)),
      })),
    );

    const stored = downloads.flatMap((d) => (d.status === "fulfilled" ? [d.value] : []));
    const failedIndex = downloads.findIndex((d) => d.status === "rejected");
    if (failedIndex !== -1) {
      // Don't leave orphaned files behind; RankGPT will retry the delivery
      await Promise.all(stored.map((image) => ctx.storage.delete(image.storageId)));
      const reason = (downloads[failedIndex] as PromiseRejectedResult).reason;
      throw new ConvexError({
        code: "IMAGE_DOWNLOAD_FAILED",
        url: images[failedIndex].url,
        message: reason instanceof Error ? reason.message : String(reason),
      });
    }

    let { contentHtml, contentMarkdown, heroImageUrl } = fields;
    for (const image of stored) {
      const url = blogImageUrl(image.filename);
      contentHtml = replaceUrl(contentHtml, image.url, url);
      contentMarkdown = replaceUrl(contentMarkdown, image.url, url);
      if (heroImageUrl === image.url) heroImageUrl = url;
    }

    await ctx.runMutation(internal.articles.save, {
      article: { ...fields, contentHtml, contentMarkdown, heroImageUrl },
      images: stored.map(({ filename, storageId }) => ({ filename, storageId })),
    });
    return { slug: fields.slug };
  },
});

export const save = internalMutation({
  args: {
    article: v.object({
      externalId: v.string(),
      title: v.string(),
      slug: v.string(),
      metaDescription: v.optional(v.string()),
      contentHtml: v.string(),
      contentMarkdown: v.string(),
      heroImageUrl: v.optional(v.string()),
      heroImageAlt: v.optional(v.string()),
      language: v.string(),
      status: articleStatus,
      publishedAt: v.string(),
    }),
    images: v.array(v.object({ filename: v.string(), storageId: v.id("_storage") })),
  },
  handler: async (ctx, { article, images }) => {
    // Files are keyed by filename; a resend overwrites the previous copy
    for (const image of images) {
      const existing = await ctx.db
        .query("blogImages")
        .withIndex("by_filename", (q) => q.eq("filename", image.filename))
        .unique();
      if (existing) {
        await ctx.storage.delete(existing.storageId);
        await ctx.db.patch(existing._id, { storageId: image.storageId });
      } else {
        await ctx.db.insert("blogImages", image);
      }
    }

    const existing = await ctx.db
      .query("articles")
      .withIndex("by_external_id", (q) => q.eq("externalId", article.externalId))
      .unique();
    if (existing) {
      await ctx.db.replace(existing._id, article);
    } else {
      await ctx.db.insert("articles", article);
    }
  },
});

export const getImage = internalQuery({
  args: { filename: v.string() },
  handler: async (ctx, { filename }): Promise<Id<"_storage"> | null> => {
    const image = await ctx.db
      .query("blogImages")
      .withIndex("by_filename", (q) => q.eq("filename", filename))
      .unique();
    return image?.storageId ?? null;
  },
});

// Published articles, newest first (drafts are never returned)
export const listPublished = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("articles")
      .withIndex("by_status_published_at", (q) => q.eq("status", "publish"))
      .order("desc")
      .collect();
  },
});

// A single published article by slug
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    return await ctx.db
      .query("articles")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .filter((q) => q.eq(q.field("status"), "publish"))
      .first();
  },
});
