// The demo build (PLAN §7) is `vite build --mode demo`. MODE is replaced at build time,
// so in the full app every `if (IS_DEMO)` branch is dead code and drops out of the bundle.
export const IS_DEMO = import.meta.env.MODE === 'demo'

const ETSY_FALLBACK = 'https://www.etsy.com/shop/SteadyPlanner'

/** The listing, with a ref so the shop can tell demo visits apart. No analytics. */
export function etsyUrl(raw: string | undefined = import.meta.env.VITE_ETSY_URL): string {
  let url: URL
  try {
    url = new URL(raw || ETSY_FALLBACK)
  } catch {
    url = new URL(ETSY_FALLBACK)
  }
  url.searchParams.set('ref', 'steady-demo')
  return url.toString()
}
