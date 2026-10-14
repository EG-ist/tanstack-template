import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { SanitizedHtml } from '../../components/SanitizedHtml'
import { formatPublishedDate, getPublishedArticle } from '../../utils/articles'

export const Route = createFileRoute('/blog/$slug')({
  loader: async ({ params }) => {
    const article = await getPublishedArticle(params.slug)
    if (!article) throw notFound()
    return article
  },
  head: ({ loaderData: article }) => ({
    meta: article
      ? [
          { title: article.title },
          ...(article.metaDescription
            ? [
                { name: 'description', content: article.metaDescription },
                { property: 'og:description', content: article.metaDescription },
              ]
            : []),
          { property: 'og:type', content: 'article' },
          { property: 'og:title', content: article.title },
          ...(article.heroImageUrl
            ? [
                { property: 'og:image', content: article.heroImageUrl },
                { property: 'og:image:alt', content: article.heroImageAlt ?? '' },
                { name: 'twitter:card', content: 'summary_large_image' },
              ]
            : []),
          { property: 'article:published_time', content: article.publishedAt },
        ]
      : [],
  }),
  notFoundComponent: () => (
    <main className="min-h-screen px-4 py-12 text-white bg-gray-900">
      <div className="max-w-3xl mx-auto">
        <h1 className="mb-4 text-3xl font-bold">Article not found</h1>
        <Link to="/blog" className="text-orange-400 hover:underline">
          Back to the blog
        </Link>
      </div>
    </main>
  ),
  component: BlogArticle,
})

function BlogArticle() {
  const article = Route.useLoaderData()

  return (
    <main className="min-h-screen px-4 py-12 text-white bg-gray-900">
      <article lang={article.language} className="max-w-3xl mx-auto">
        <Link to="/blog" className="text-sm text-orange-400 hover:underline">
          ← All articles
        </Link>
        <h1 className="mt-4 mb-2 text-4xl font-bold">{article.title}</h1>
        <time dateTime={article.publishedAt} className="text-sm text-gray-400">
          {formatPublishedDate(article.publishedAt)}
        </time>
        {article.heroImageUrl && (
          <img
            src={article.heroImageUrl}
            alt={article.heroImageAlt ?? ''}
            className="object-cover w-full my-8 rounded-lg aspect-video"
          />
        )}
        <SanitizedHtml
          html={article.contentHtml}
          className="prose dark:prose-invert max-w-none"
        />
      </article>
    </main>
  )
}
