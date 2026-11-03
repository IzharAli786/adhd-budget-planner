import type { ReactNode } from 'react'
import { Icon, type IconName } from '../../ui/Icon'
import { PageHeader } from '../../ui/PageHeader'
import { SectionHeader } from '../../ui/Section'
import { SECTION_GUIDE } from '../start/sections'

interface Part {
  icon: IconName
  name: string
  /** Only shown with "Show more tools" on. */
  full?: boolean
  body: string
}

// Getting started, the sections in menu order (the same lines it shows), then More.
const PARTS: readonly Part[] = [
  {
    icon: 'info',
    name: 'Getting started',
    body: 'Your currency, starting balance and roll over in one place, and a line on what each section is for.',
  },
  ...SECTION_GUIDE.map((s) => ({ icon: s.icon, name: s.label, full: s.full, body: s.body })),
  {
    icon: 'more',
    name: 'More',
    body: 'On a phone, the sections the bar has no room for, plus everything you’ve logged, backups, recently deleted items and this guide.',
  },
]

const FAQ: readonly { q: string; a: ReactNode }[] = [
  {
    q: 'Does it work offline?',
    a: 'Yes. Once it’s installed (or opened once), everything runs on this device with no connection needed. Updates download quietly and wait until you tap Refresh.',
  },
  {
    q: 'How do backups work?',
    a: 'Settings › Backups (also in More) saves one small file with everything in it. Keep it somewhere safe, like your email or cloud drive. Steady reminds you now and then, usually around payday. Restoring that file on any device brings it all back.',
  },
  {
    q: 'What does “estimate” mean?',
    a: 'Steady can’t see your bank. Safe to spend is money in (your starting balance the first month, then your pay and any income you log) minus bills minus spending. Savings and debt payments are tracked on their own and never lower it. It’s a helpful guide, not a promise, and not financial advice. Change the currency, starting balance or roll over any time in Getting started.',
  },
  {
    q: 'Simple or Full?',
    a: 'Steady starts with every section. Turning off “Show more tools” in More or Settings gives a simpler app: Today, Calendar, Getting started and Settings. Switching never deletes anything.',
  },
  {
    q: 'Is my data private?',
    a: 'Everything stays on this device. There’s no account, no tracking and no server holding your numbers. Only a backup file you choose to save ever leaves it.',
  },
]

/** More › How each part works: one card per section, then the questions people ask. */
export function HelpScreen() {
  return (
    <>
      <PageHeader
        title="How each part works"
        subtitle="A minute’s read. Nothing here is required."
        back={{ to: '/more', label: 'More' }}
      />
      <div className="space-y-8">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PARTS.map((part) => (
            <li key={part.name} className="card p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <Icon name={part.icon} size={20} />
                </span>
                <h2 className="text-heading">{part.name}</h2>
                {part.full && (
                  <span className="ml-auto rounded-full bg-bg px-2.5 py-1 text-caption text-muted">
                    More tools
                  </span>
                )}
              </div>
              <p className="mt-3 text-body text-muted">{part.body}</p>
            </li>
          ))}
        </ul>

        <section aria-labelledby="faq-title" className="space-y-2 lg:max-w-3xl">
          <SectionHeader id="faq-title" title="Questions" />
          <div className="card divide-y divide-line overflow-hidden">
            {FAQ.map(({ q, a }) => (
              <details key={q} className="group">
                <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 py-3 font-medium transition-colors hover:bg-accent-soft/40 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 flex-1">{q}</span>
                  <Icon
                    name="down"
                    size={18}
                    className="shrink-0 text-muted transition-transform group-open:rotate-180"
                  />
                </summary>
                <p className="px-5 pb-4 text-body text-muted">{a}</p>
              </details>
            ))}
          </div>
        </section>

        <p className="px-1 text-center text-sm text-muted lg:text-left">
          Estimates only, not financial advice.
        </p>
      </div>
    </>
  )
}
