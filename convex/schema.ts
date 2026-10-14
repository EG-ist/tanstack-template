import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  conversations: defineTable({
    title: v.string(),
    messages: v.array(
      v.object({
        id: v.string(),
        role: v.union(v.literal("user"), v.literal("assistant")),
        content: v.string(),
      })
    ),
  }),
  // Blog articles delivered by the RankGPT webhook (src/routes/api/rankgpt-webhook.ts)
  articles: defineTable({
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
  })
    .index("by_slug", ["slug"])
    .index("by_external_id", ["externalId"])
    .index("by_published_at", ["publishedAt"]),
});
