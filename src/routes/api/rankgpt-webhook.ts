import { json } from '@tanstack/react-start'
import { createAPIFileRoute } from '@tanstack/react-start/api'
import { ConvexHttpClient } from 'convex/browser'
import { createHash, timingSafeEqual } from 'node:crypto'
import { api } from '../../../convex/_generated/api'

// Receives articles pushed by RankGPT (https://rankgpt.com) and stores them in
// Convex so they render at /blog/$slug.
//
// Required environment variables:
//   RANKGPT_WEBHOOK_SECRET - the rgpt_whsec_... key from RankGPT (set it in the
//                            site's env AND the Convex deployment env)
//   VITE_CONVEX_URL        - the Convex deployment URL

type RankGPTImage = {
  url: string
  alt?: string
  filename?: string
  is_hero?: boolean
}

type RankGPTArticle = {
  event?: string
  id: string | number
  title: string
  slug: string
  meta_description?: string
  content_html?: string
  content_markdown?: string
  hero_image_url?: string
  hero_image_alt?: string
  images?: Array<RankGPTImage>
  language?: string
  status?: string
  published_at?: string
}

const UPSERT_EVENTS = new Set([
  'article.published',
  'article.updated',
  'article.created',
])
const DELETE_EVENTS = new Set(['article.deleted', 'article.unpublished'])

function sha256(value: string) {
  return createHash('sha256').update(value).digest()
}

// Accepts the secret from either `Authorization: Bearer ...` or `X-API-Key`
function isAuthorized(request: Request, secret: string) {
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const apiKey = request.headers.get('x-api-key')
  const expected = sha256(secret)
  return [bearer, apiKey].some(
    (candidate) => !!candidate && timingSafeEqual(sha256(candidate), expected),
  )
}

function isArticle(body: unknown): body is RankGPTArticle {
  if (!body || typeof body !== 'object') return false
  const article = body as Record<string, unknown>
  return (
    (typeof article.id === 'string' || typeof article.id === 'number') &&
    typeof article.title === 'string' &&
    typeof article.slug === 'string' &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug)
  )
}

export const APIRoute = createAPIFileRoute('/api/rankgpt-webhook')({
  POST: async ({ request }) => {
    const secret = process.env.RANKGPT_WEBHOOK_SECRET
    const convexUrl = process.env.VITE_CONVEX_URL ?? import.meta.env.VITE_CONVEX_URL
    if (!secret || !convexUrl) {
      console.error('RankGPT webhook is missing RANKGPT_WEBHOOK_SECRET or VITE_CONVEX_URL')
      return json({ error: 'Webhook not configured' }, { status: 500 })
    }

    if (!isAuthorized(request, secret)) {
      return json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const event =
      request.headers.get('x-rankgpt-event') ??
      (body as { event?: string } | null)?.event ??
      'article.published'
    const deliveryId = request.headers.get('x-rankgpt-delivery')

    if (!isArticle(body)) {
      return json({ error: 'Invalid article payload' }, { status: 400 })
    }

    const convex = new ConvexHttpClient(convexUrl)
    const externalId = String(body.id)

    try {
      if (DELETE_EVENTS.has(event)) {
        await convex.mutation(api.articles.removeByExternalId, { secret, externalId })
        return json({ ok: true, event, deliveryId, slug: body.slug })
      }

      if (!UPSERT_EVENTS.has(event)) {
        // Acknowledge unknown events so RankGPT doesn't keep retrying them
        return json({ ok: true, ignored: true, event, deliveryId })
      }

      await convex.mutation(api.articles.upsert, {
        secret,
        article: {
          externalId,
          title: body.title,
          slug: body.slug,
          metaDescription: body.meta_description ?? '',
          contentHtml: body.content_html ?? '',
          contentMarkdown: body.content_markdown ?? '',
          heroImageUrl: body.hero_image_url || undefined,
          heroImageAlt: body.hero_image_alt || undefined,
          images: (body.images ?? []).map((image) => ({
            url: image.url,
            alt: image.alt ?? '',
            filename: image.filename ?? '',
            isHero: image.is_hero ?? false,
          })),
          language: body.language ?? 'en',
          status: body.status ?? 'publish',
          publishedAt: body.published_at ?? new Date().toISOString(),
        },
      })
    } catch (error) {
      console.error('RankGPT webhook failed to save article', deliveryId, error)
      return json({ error: 'Failed to save article' }, { status: 500 })
    }

    return json({
      ok: true,
      event,
      deliveryId,
      slug: body.slug,
      url: `/blog/${body.slug}`,
    })
  },
})
