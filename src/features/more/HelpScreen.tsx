import type { ReactNode } from 'react'
import { Icon, type IconName } from '../../ui/Icon'
import { PageHeader } from '../../ui/PageHeader'
import { SectionHeader } from '../../ui/Section'

interface Part {
  icon: IconName
  name: string
  /** Plan and Goals only show with "Show more tools" on. */
  full?: boolean
  body: string
}

const PARTS: readonly Part[] = [
  {
    icon: 'today',
    name: 'Today',
    body: 'One number: what you can spend today and still be fine until payday. Log spending by typing “12 coffee” and the number updates. Tap “See the math” any time.',
  },
  {
    icon: 'bills',
    name: 'Bills',
    body: 'What’s due and when your pay lands, as a list and a calendar. Bills due before payday are already set aside in today’s number, so you don’t have to remember them.',
  },
  {
    icon: 'plan',
    name: 'Plan',
    full: true,
    body: 'Where this paycheck goes: income, bills, what’s set aside and what’s free. Try a price in “Can this fit?” without saving anything.',
  },
  {
    icon: 'goals',
    name: 'Goals',
    full: true,
    body: 'Savings funds, debts, no-spend days and the 48-hour list. The garden grows with good moments and never shrinks.',
  },
  {
    icon: 'more',
    name: 'More',
    body: 'Your entries, backups, recently deleted items and settings like theme, text size and currency.',
  },
]

const FAQ: readonly { q: string; a: ReactNode }[] = [
  {
    q: 'Does it work offline?',
    a: 'Yes. Once it’s installed (or opened once), everything runs on this device with no connection needed. Updates download quietly and wait until you tap Refresh.',
  },
  {
    q: 'How do backups work?',
    a: 'More › Backup & restore saves one small file with everything in it. Keep it somewhere safe, like your email or cloud drive. Steady reminds you now and then, usually around payday. Restoring that file on any device brings it all back.',
  },
  {
    q: 'What does “estimate” mean?',
    a: 'Steady can’t see your bank. Its numbers come from what you enter: your balance, pay, bills and spending. They’re a helpful guide, not a promise, and not financial advice. Updating your balance now and then keeps them close.',
  },
  {
    q: 'Simple or Full?',
    a: 'Steady starts with every tab. Turning off “Show more tools” in More gives a simpler app with just Today, Bills and More. Switching never deletes anything.',
  },
  {
    q: 'Is my data private?',
    a: 'Everything stays on this device. There’s no account, no tracking and no server holding your numbers. Only a backup file you choose to save ever leaves it.',
  },
]

/** More › How each part works: one kind card per tab, then the questions people ask. */
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
