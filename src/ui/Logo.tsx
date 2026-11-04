/**
 * Steady's mark (public/icon.svg's geometry) in the theme's own colours, so the rail's
 * logo follows the theme instead of staying clay in every one. The favicon file keeps
 * its fixed colours. Decorative: "Steady" is written next to it or in the page title.
 */
export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <rect width="512" height="512" rx="116" style={{ fill: 'var(--accent)' }} />
      <circle cx="352" cy="152" r="42" style={{ fill: 'var(--accent-contrast)' }} />
      <path
        d="M128 384h80v-64h80v-64h96"
        fill="none"
        strokeWidth="32"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ stroke: 'var(--accent-contrast)' }}
      />
    </svg>
  )
}
