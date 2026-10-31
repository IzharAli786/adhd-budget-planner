import { useEffect } from 'react'
import { etsyUrl } from '../../lib/demo'
import { Icon } from '../../ui/Icon'

/**
 * The one persistent line that says this is the demo (PLAN §7). A link to the listing
 * and nothing else: no checkout, no countdown, no nag. Sticky, so it never scrolls away,
 * and it publishes its height so the desktop side rail starts below it.
 */
export function DemoBanner() {
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--demo-banner-h', 'calc(2.75rem + env(safe-area-inset-top))')
    return () => void root.style.removeProperty('--demo-banner-h')
  }, [])

  return (
    <div
      role="region"
      aria-label="Demo"
      className="sticky top-0 z-50 border-b border-line bg-surface/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl"
    >
      <p className="mx-auto flex min-h-11 max-w-2xl flex-wrap items-center justify-center gap-x-1.5 px-4 text-center text-sm">
        <span className="text-muted">Free demo ·</span>
        <a
          href={etsyUrl()}
          target="_blank"
          rel="noopener"
          className="inline-flex min-h-11 items-center gap-1 rounded-full px-1 font-medium text-accent"
        >
          Get the full app on Etsy
          <Icon name="external" size={14} />
        </a>
      </p>
    </div>
  )
}
