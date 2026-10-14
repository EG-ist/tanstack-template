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
    metaDescription: v.optional(v.string()),
    contentHtml: v.string(),
    contentMarkdown: v.string(),
    heroImageUrl: v.optional(v.string()),
    heroImageAlt: v.optional(v.string()),
    language: v.string(),
    status: v.union(v.literal("publish"), v.literal("draft")),
    publishedAt: v.string(),
  })
    .index("by_external_id", ["externalId"])
    .index("by_slug", ["slug"])
    .index("by_status_published_at", ["status", "publishedAt"]),
  // Article images copied into Convex storage, served at /blog-images/<filename>
  blogImages: defineTable({
    filename: v.string(),
    storageId: v.id("_storage"),
  }).index("by_filename", ["filename"]),
});
