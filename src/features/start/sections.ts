import { TABS, type TabDef } from '../../app/tabs'

/** What each section is for, in a line or two. Keyed by route, so a renamed tab keeps it. */
const ABOUT: Readonly<Record<string, string>> = {
  '/home':
    'Any month as charts: money in against money out, where the spending went, each envelope’s budget, and what’s still free to spend.',
  '/': 'The state of things today: what’s safe to spend this month, your savings and debts in two numbers, bills due soon to tick off, and the goals you’re working on.',
  '/bills':
    'Tap a day to add spending, income, a bill, savings or a debt payment, once or every month. Point it at an envelope, a fund or a debt, and tick bills off as you pay them.',
  '/goals':
    'What the money is for. Move each life goal from not started to in progress to done. No-spend days, the 48-hour list and the garden live here too.',
  '/savings':
    'A fund for each thing you’re saving for, like a cushion or a trip, with how close it is and, given a date, what to add each payday.',
  '/debt':
    'Every card and loan, what’s left on each and when it could be cleared. Compare highest interest first with smallest balance first.',
  '/envelopes':
    'A tab for each month of the year. Give every kind of spending an envelope with a budget, log money in and out, and see the budget next to what was spent. The “Track spending” button logs a purchase from any screen.',
  '/review':
    'The year added up by month or payday: money in against money out, what went into savings, how far debts came down. Ready to print.',
  '/more/settings':
    'Your name, colours, light or dark, text size and formats. Backing up, restoring and erasing everything are one tap from here.',
}

export interface SectionGuide extends TabDef {
  body: string
}

/**
 * Every section in navigation order, with its line. Built from the tabs themselves, so
 * the guide can never list them in a different order from the menu.
 */
export const SECTION_GUIDE: readonly SectionGuide[] = TABS.flatMap((tab) => {
  const body = ABOUT[tab.to]
  return body ? [{ ...tab, body }] : []
})
