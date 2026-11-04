import { useEffect, useMemo, useRef, useState } from 'react'
import { isValidISODate } from '../../domain/dates'
import { buildReport, reportCounts, type Report } from '../../domain/report'
import type { ISODate } from '../../domain/types'
import { canShareFile, download, shareOrDownload } from '../../lib/share'
import { useToday } from '../../lib/useToday'
import { Button } from '../../ui/Button'
import { Chip } from '../../ui/Chip'
import { DateInput } from '../../ui/DateInput'
import { Notice } from '../../ui/Notice'
import { PageHeader } from '../../ui/PageHeader'
import { Stat } from '../../ui/Stat'
import { useFormat, type Formatters } from '../bills/format'
import { PRESETS, presetRange, type InclusiveRange, type Preset } from './presets'
import { renderReportFile } from './reportPdf'
import { useReportInput } from './useReportInput'

type Made =
  | { state: 'idle' }
  | { state: 'working'; key: string }
  | { state: 'ready'; key: string; file: File }
  | { state: 'error'; key: string }

/**
 * More > Reports: pick two dates, see what the report will hold, make a PDF of it. Works
 * the same in the demo (sample data), and writes nothing, so it never touches the cap.
 */
export function ReportsScreen() {
  const today = useToday()
  const input = useReportInput(today)
  const f = useFormat()
  const [preset, setPreset] = useState<Preset>('thisMonth')
  // Custom dates the person typed; a preset's dates are worked out from today instead,
  // so "This month" stays right across midnight at the end of a month.
  const [custom, setCustom] = useState<InclusiveRange | null>(null)
  const [made, setMade] = useState<Made>({ state: 'idle' })

  const range = useMemo<InclusiveRange | null>(() => {
    if (preset === 'custom') return custom
    if (!input) return null
    return presetRange(preset, today, input.incomes, input.paydayOverrides)
  }, [preset, custom, input, today])

  const from = range?.from ?? ''
  const to = range?.to ?? ''
  // Each field says what is wrong with it, so a screen reader hears it on that field.
  const fromError = isValidISODate(from) ? null : 'Pick a start date.'
  const toError = !isValidISODate(to)
    ? 'Pick an end date.'
    : !fromError && from > to
      ? 'The end date is before the start date.'
      : null
  const error = fromError ?? toError

  const report = useMemo<Report | null>(
    () => (input && !error ? buildReport(input, from, to) : null),
    [input, error, from, to],
  )
  const key = `${from}|${to}`

  function pick(next: Preset) {
    setPreset(next)
    if (next === 'custom') setCustom(range)
  }
  function edit(which: 'from' | 'to', value: ISODate) {
    setPreset('custom')
    setCustom({ from, to, [which]: value })
  }

  async function create() {
    if (!report) return
    setMade({ state: 'working', key })
    try {
      const file = await renderReportFile(report)
      setMade({ state: 'ready', key, file })
    } catch {
      setMade({ state: 'error', key })
    }
  }

  // A result for other dates is stale the moment the dates change.
  const current = made.state !== 'idle' && made.key === key ? made : { state: 'idle' as const }

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="A PDF of everything in a date range."
        back={{ to: '/more', label: 'More' }}
      />
      {!input ? (
        <div aria-hidden="true" className="h-64 animate-pulse rounded-3xl bg-surface" />
      ) : (
        <div className="space-y-6">
          <section aria-labelledby="dates-title" className="card space-y-5 p-5 sm:p-6">
            <h2 id="dates-title" className="text-heading">
              Which dates?
            </h2>
            <div role="group" aria-label="Quick ranges" className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <Chip key={p.value} selected={preset === p.value} onClick={() => pick(p.value)}>
                  {p.label}
                </Chip>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <DateInput
                label="From"
                value={from}
                onChange={(v) => edit('from', v)}
                format={f.dayFull}
                error={fromError ?? undefined}
              />
              <DateInput
                label="To"
                value={to}
                min={isValidISODate(from) ? from : undefined}
                onChange={(v) => edit('to', v)}
                format={f.dayFull}
                error={toError ?? undefined}
                hint={
                  !error && to > today ? 'Days after today have nothing logged yet.' : undefined
                }
              />
            </div>
          </section>

          {report && <Preview report={report} f={f} />}

          <section aria-label="Make the PDF" className="space-y-3">
            {current.state === 'ready' ? (
              <Ready file={current.file} />
            ) : (
              <Button
                size="lg"
                block
                disabled={!report || current.state === 'working'}
                aria-busy={current.state === 'working' || undefined}
                icon="report"
                onClick={() => void create()}
              >
                {current.state === 'working' ? 'Making your report…' : 'Create PDF'}
              </Button>
            )}
            {current.state === 'error' && (
              <Notice tone="attention" role="alert">
                The PDF couldn’t be made this time. Please try again.
              </Notice>
            )}
            {/* Always in the page, so the change is announced as it happens. */}
            <p aria-live="polite" className="text-sm text-muted empty:hidden">
              {error ? `${error} Fix the dates above to make a report.` : ''}
            </p>
          </section>

          <p className="px-1 text-center text-sm text-muted">
            Made on this device: nothing is uploaded.
            <br />
            Estimates from what you entered. Not financial advice.
          </p>
        </div>
      )}
    </>
  )
}

/** What the PDF will hold, so nobody makes one to find out. */
function Preview({ report, f }: { report: Report; f: Formatters }) {
  const { summary: s, meta } = report
  const counts = reportCounts(report)
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  return (
    <section aria-labelledby="preview-title" className="card p-5 sm:p-6">
      <h2 id="preview-title" className="text-heading">
        What’s in it
      </h2>
      <p className="mt-0.5 text-body text-muted">
        {f.dayFull(meta.from)} to {f.dayFull(meta.to)} · {plural(meta.days, 'day', 'days')}
      </p>
      {report.isEmpty ? (
        <p className="mt-4 rounded-2xl bg-bg px-4 py-3 text-body text-muted">
          Nothing logged in these dates yet. You can still make the PDF: it will show zeros.
        </p>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Stat size="sm" label="Money in" value={f.money(s.moneyIn)} />
            <Stat size="sm" label="Money out" value={f.money(s.moneyOut)} />
            <Stat
              size="sm"
              label={s.leftOver >= 0 ? 'Left over' : 'More out than in'}
              value={f.money(Math.abs(s.leftOver))}
            />
          </div>
          <p className="mt-4 text-body" data-testid="report-counts">
            {plural(counts.transactions, 'transaction', 'transactions')} ·{' '}
            {plural(counts.billsPaid, 'bill paid', 'bills paid')}
            {report.noSpendDays.count > 0
              ? ` · ${plural(report.noSpendDays.count, 'no-spend day', 'no-spend days')}`
              : ''}
          </p>
        </>
      )}
    </section>
  )
}

/**
 * The file is already made, so the share sheet opens inside the tap (iOS refuses it
 * otherwise). Download is always there: most desktops have no file share.
 */
function Ready({ file }: { file: File }) {
  const share = canShareFile(file)
  // The Create button the person pressed is gone; put focus (and the screen reader) on
  // the result instead of letting it fall back to the top of the page.
  const title = useRef<HTMLParagraphElement>(null)
  useEffect(() => title.current?.focus(), [])
  return (
    <div className="card space-y-3 p-5" role="status">
      <p ref={title} tabIndex={-1} className="text-body font-medium outline-none">
        Your report is ready.
      </p>
      <p className="text-sm text-muted break-all">{file.name}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        {share && (
          <Button icon="share" onClick={() => void shareOrDownload(file)}>
            Share or save
          </Button>
        )}
        <Button
          variant={share ? 'secondary' : 'primary'}
          icon="download"
          onClick={() => download(file)}
        >
          Download
        </Button>
      </div>
    </div>
  )
}
