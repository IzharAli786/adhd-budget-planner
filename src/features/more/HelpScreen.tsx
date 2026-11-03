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
    body: 'One number: what you can spend today and still be fine this month. Below it, the shape of your money: saved, still owed, safe to spend, what’s coming up (tick bills off as you pay them) and the goals in motion. Log spending by typing “12 coffee”.',
  },
  {
    icon: 'calendar',
    name: 'Calendar',
    body: 'Tap any day to add an expense, income, bill, savings or a debt payment, even repeating every month. Everything logged on a day shows there, with Edit and × right on it.',
  },
  {
    icon: 'plan',
    name: 'Plan',
    full: true,
    body: 'Pick any month and see its whole picture: money in, bills, spending and safe to spend, budget vs actual for every envelope, where the money went and what’s left. Try a price in “Can this fit?” without saving anything.',
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
    a: 'Steady can’t see your bank. Safe to spend is money in (your starting balance the first month, then your pay and any income you log) minus bills minus spending. Savings and debt payments are tracked on their own and never lower it. It’s a helpful guide, not a promise, and not financial advice. Change the starting balance, currency or roll over any time in More › Money basics.',
  },
  {
    q: 'Simple or Full?',
    a: 'Steady starts with every tab. Turning off “Show more tools” in More gives a simpler app with just Today, Calendar and More. Switching never deletes anything.',
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
