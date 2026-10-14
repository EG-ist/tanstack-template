import { json } from '@tanstack/react-start'
import { createAPIFileRoute } from '@tanstack/react-start/api'
import { ConvexHttpClient } from 'convex/browser'
import { ConvexError } from 'convex/values'
import { createHash, timingSafeEqual } from 'node:crypto'
import { api } from '../../../convex/_generated/api'

// Receives articles pushed by RankGPT (https://rankgpt.com). Images are copied
// into Convex storage and the article is saved by convex/articles.ts:ingest.
//
// Required environment variables:
//   RANKGPT_WEBHOOK_SECRET - shared secret from RankGPT; set it in the site's
//                            env AND the Convex deployment env
//   VITE_CONVEX_URL        - the Convex deployment URL
// Optional:
//   SITE_URL               - public site origin for the returned link
//                            (defaults to Netlify's URL, then the request origin)

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const FILENAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/

type Article = {
  externalId: string
  title: string
  slug: string
  metaDescription?: string
  contentHtml: string
  contentMarkdown: string
  heroImageUrl?: string
  heroImageAlt?: string
  images: Array<{ url: string; filename: string }>
  language: string
  status: 'publish' | 'draft'
  publishedAt: string
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest()
}

// Accepts `Authorization: Bearer <secret>` or `X-API-Key: <secret>`.
// Hashing first gives equal-length buffers, so the comparison is constant time.
function isAuthorized(request: Request, secret: string) {
  const authorization = request.headers.get('authorization')
  const bearer = authorization?.match(/^Bearer (.+)$/i)?.[1] ?? null
  const apiKey = request.headers.get('x-api-key')
  const expected = sha256(secret)
  return [bearer, apiKey].some(
    (candidate) => candidate !== null && timingSafeEqual(sha256(candidate), expected),
  )
}

const isString = (value: unknown): value is string => typeof value === 'string'
const isOptionalString = (value: unknown): value is string | null | undefined =>
  value == null || typeof value === 'string'

function isHttpUrl(value: string) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

// Returns the article, or an error message describing the first problem
function parseArticle(body: Record<string, unknown>): Article | string {
  const {
    id,
    title,
    slug,
    meta_description,
    content_html,
    content_markdown,
    hero_image_url,
    hero_image_alt,
    images,
    language,
    status,
    published_at,
  } = body

  if (!isString(id) || !id) return 'id must be a non-empty string'
  if (!isString(title) || !title.trim()) return 'title must be a non-empty string'
  if (!isString(slug) || !SLUG_PATTERN.test(slug)) return 'slug must be lowercase words separated by hyphens'
  if (!isOptionalString(meta_description)) return 'meta_description must be a string or null'
  if (!isString(content_html)) return 'content_html must be a string'
  if (!isOptionalString(content_markdown)) return 'content_markdown must be a string'
  if (!isOptionalString(hero_image_url)) return 'hero_image_url must be a string or null'
  if (!isOptionalString(hero_image_alt)) return 'hero_image_alt must be a string or null'
  if (!isString(language) || !language) return 'language must be a non-empty string'
  if (status !== 'publish' && status !== 'draft') return 'status must be "publish" or "draft"'
  if (!isString(published_at) || Number.isNaN(Date.parse(published_at))) {
    return 'published_at must be an ISO 8601 date'
  }
  if (!Array.isArray(images)) return 'images must be an array'

  const parsedImages: Article['images'] = []
  for (const [index, image] of images.entries()) {
    if (!image || typeof image !== 'object') return `images[${index}] must be an object`
    const { url, filename } = image as Record<string, unknown>
    if (!isString(url) || !isHttpUrl(url)) return `images[${index}].url must be an http(s) URL`
    if (!isString(filename) || !FILENAME_PATTERN.test(filename)) {
      return `images[${index}].filename must contain only letters, digits, ".", "_" and "-"`
    }
    parsedImages.push({ url, filename })
  }

  return {
    externalId: id,
    title,
    slug,
    metaDescription: meta_description ?? undefined,
    contentHtml: content_html,
    contentMarkdown: content_markdown ?? '',
    heroImageUrl: hero_image_url || undefined,
    heroImageAlt: hero_image_alt ?? undefined,
    images: parsedImages,
    language,
    status,
    publishedAt: published_at,
  }
}

function siteOrigin(request: Request) {
  const configured = process.env.SITE_URL ?? process.env.URL
  return (configured ?? new URL(request.url).origin).replace(/\/+$/, '')
}

export const APIRoute = createAPIFileRoute('/api/rankgpt-webhook')({
  POST: async ({ request }) => {
    const secret = process.env.RANKGPT_WEBHOOK_SECRET
    if (!secret) {
      console.error('RankGPT webhook is missing RANKGPT_WEBHOOK_SECRET')
      return json({ error: 'Webhook not configured' }, { status: 500 })
    }

    if (!isAuthorized(request, secret)) {
      return json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return json({ error: 'Body must be valid JSON' }, { status: 400 })
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return json({ error: 'Body must be a JSON object' }, { status: 400 })
    }

    if ((body as { event?: unknown }).event === 'test') {
      return json({ ok: true })
    }

    const article = parseArticle(body as Record<string, unknown>)
    if (typeof article === 'string') {
      return json({ error: article }, { status: 400 })
    }

    // Checked after the test event so RankGPT can connect before Convex is set up
    const convexUrl = process.env.VITE_CONVEX_URL ?? import.meta.env.VITE_CONVEX_URL
    if (!convexUrl) {
      console.error('RankGPT webhook is missing VITE_CONVEX_URL')
      return json({ error: 'Webhook not configured' }, { status: 500 })
    }

    const deliveryId = request.headers.get('x-rankgpt-delivery')
    try {
      const convex = new ConvexHttpClient(convexUrl)
      const { slug } = await convex.action(api.articles.ingest, { secret, article })
      return json({ link: `${siteOrigin(request)}/blog/${slug}` })
    } catch (error) {
      const data = error instanceof ConvexError ? error.data : undefined
      console.error('RankGPT webhook failed', { deliveryId, data, error })
      if (data?.code === 'IMAGE_DOWNLOAD_FAILED') {
        return json({ error: `Failed to download image ${data.url}` }, { status: 500 })
      }
      return json({ error: 'Failed to save article' }, { status: 500 })
    }
  },
})
