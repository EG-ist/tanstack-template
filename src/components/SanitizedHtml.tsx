import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import { fromHtml } from 'hast-util-from-html'
import { sanitize } from 'hast-util-sanitize'
import { toJsxRuntime } from 'hast-util-to-jsx-runtime'

// Renders third-party HTML as React elements after stripping scripts, event
// handlers and unsafe URLs (GitHub's sanitization schema).
export const SanitizedHtml = ({
  html,
  className,
}: {
  html: string
  className?: string
}) => (
  <div className={className}>
    {toJsxRuntime(sanitize(fromHtml(html, { fragment: true })), {
      Fragment,
      jsx,
      jsxs,
    })}
  </div>
)
