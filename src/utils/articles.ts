import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../convex/_generated/api'

// Plain HTTP client so blog routes can load articles in their loaders,
// which run on the server for the first request (good for SEO).
export function getArticlesClient() {
  const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined
  return convexUrl ? new ConvexHttpClient(convexUrl) : null
}

export async function listPublishedArticles() {
  const client = getArticlesClient()
  return client ? await client.query(api.articles.listPublished, {}) : []
}

export async function getPublishedArticle(slug: string) {
  const client = getArticlesClient()
  return client ? await client.query(api.articles.getBySlug, { slug }) : null
}

export function formatPublishedDate(publishedAt: string) {
  return new Date(publishedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    // Fixed zone so server and browser render the same date
    timeZone: 'UTC',
  })
}
