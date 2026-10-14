import { createFileRoute, Link } from '@tanstack/react-router'
import { formatPublishedDate, listPublishedArticles } from '../../utils/articles'

export const Route = createFileRoute('/blog/')({
  loader: () => listPublishedArticles(),
  head: () => ({
    meta: [
      { title: 'Blog' },
      { name: 'description', content: 'Guides and articles.' },
    ],
  }),
  component: BlogIndex,
})

function BlogIndex() {
  const articles = Route.useLoaderData()

  return (
    <main className="min-h-screen px-4 py-12 text-white bg-gray-900">
      <div className="max-w-3xl mx-auto">
        <h1 className="mb-8 text-4xl font-bold">Blog</h1>
        {articles.length === 0 ? (
          <p className="text-gray-400">No articles yet.</p>
        ) : (
          <ul className="space-y-8">
            {articles.map((article) => (
              <li key={article._id}>
                <Link
                  to="/blog/$slug"
                  params={{ slug: article.slug }}
                  className="block group"
                >
                  {article.heroImageUrl && (
                    <img
                      src={article.heroImageUrl}
                      alt={article.heroImageAlt ?? ''}
                      loading="lazy"
                      className="object-cover w-full mb-4 rounded-lg aspect-video"
                    />
                  )}
                  <h2 className="text-2xl font-semibold group-hover:text-orange-400">
                    {article.title}
                  </h2>
                  <time
                    dateTime={article.publishedAt}
                    className="text-sm text-gray-400"
                  >
                    {formatPublishedDate(article.publishedAt)}
                  </time>
                  {article.metaDescription && (
                    <p className="mt-2 text-gray-300">{article.metaDescription}</p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
