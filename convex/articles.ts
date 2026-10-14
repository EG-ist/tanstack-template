import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const articleFields = {
  externalId: v.string(),
  title: v.string(),
  slug: v.string(),
  metaDescription: v.string(),
  contentHtml: v.string(),
  contentMarkdown: v.string(),
  heroImageUrl: v.optional(v.string()),
  heroImageAlt: v.optional(v.string()),
  images: v.array(
    v.object({
      url: v.string(),
      alt: v.string(),
      filename: v.string(),
      isHero: v.boolean(),
    })
  ),
  language: v.string(),
  status: v.string(),
  publishedAt: v.string(),
};

// Public mutations are callable by anyone holding the Convex URL, so writes
// require the same webhook secret, set in the Convex deployment environment.
function assertSecret(secret: string) {
  const expected = process.env.RANKGPT_WEBHOOK_SECRET;
  if (!expected || secret !== expected) {
    throw new Error("Unauthorized");
  }
}

// Insert or update an article, matched by RankGPT id (falling back to slug)
export const upsert = mutation({
  args: { secret: v.string(), article: v.object(articleFields) },
  handler: async (ctx, { secret, article }) => {
    assertSecret(secret);
    const existing =
      (await ctx.db
        .query("articles")
        .withIndex("by_external_id", (q) => q.eq("externalId", article.externalId))
        .unique()) ??
      (await ctx.db
        .query("articles")
        .withIndex("by_slug", (q) => q.eq("slug", article.slug))
        .unique());

    if (existing) {
      await ctx.db.replace(existing._id, article);
      return existing._id;
    }
    return await ctx.db.insert("articles", article);
  },
});

// Remove an article by RankGPT id
export const removeByExternalId = mutation({
  args: { secret: v.string(), externalId: v.string() },
  handler: async (ctx, { secret, externalId }) => {
    assertSecret(secret);
    const existing = await ctx.db
      .query("articles")
      .withIndex("by_external_id", (q) => q.eq("externalId", externalId))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

// Published articles, newest first
export const listPublished = query({
  handler: async (ctx) => {
    const articles = await ctx.db
      .query("articles")
      .withIndex("by_published_at")
      .order("desc")
      .collect();
    return articles.filter((article) => article.status === "publish");
  },
});

// A single published article by slug
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const article = await ctx.db
      .query("articles")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    return article?.status === "publish" ? article : null;
  },
});
