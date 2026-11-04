import { useState, type ReactNode } from 'react'
import { promptInstall, type InstallContext } from '../../lib/install'
import { copyText } from '../../lib/share'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { Logo } from '../../ui/Logo'
import { PageHeader } from '../../ui/PageHeader'
import { useInstallContext } from './useInstall'

interface InstallScreenProps {
  /** Inside the app shell (More > Install) rather than the full-screen first-run gate. */
  embedded?: boolean
  onContinue?: () => void
  /** Overrides detection; used by tests and the dev preview. */
  context?: InstallContext
}

export function InstallScreen({ embedded = false, onContinue, context }: InstallScreenProps) {
  const detected = useInstallContext()
  const ctx = context ?? detected

  const body = (
    <>
      {ctx === 'ios' && <IOSGuide />}
      {ctx === 'in-app' && <InAppGuide />}
      {ctx === 'prompt' && <PromptInstall />}
      {ctx === 'unsupported' && <MenuInstall />}
      {ctx === 'installed' && (
        <p className="text-body text-muted">
          Steady is installed. Open it from your home screen or app list.
        </p>
      )}
    </>
  )

  if (embedded) {
    return (
      <>
        <PageHeader title="Install Steady" back={{ to: '/more', label: 'More' }} />
        <div className="card p-5 sm:p-6">{body}</div>
      </>
    )
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pt-[max(env(safe-area-inset-top),2.5rem)] pb-[max(env(safe-area-inset-bottom),1.5rem)]">
      <div className="animate-fade-in flex-1">
        <Logo size={64} className="rounded-[0.9rem] shadow-card" />
        <h1 className="mt-6 type-display text-[2rem] leading-tight">
          {ctx === 'in-app'
            ? 'Open Steady in your browser'
            : 'Install first, so your data stays safe'}
        </h1>
        <p className="mt-3 text-base text-muted">
          {ctx === 'in-app'
            ? 'This app opened inside another app, which can erase what you save.'
            : 'Steady keeps everything on your phone. On iPhone, a browser tab and the home-screen app keep separate data, so start in the app.'}
        </p>
        <div className="mt-8">{body}</div>
      </div>
      {onContinue && (
        <Button variant="quiet" onClick={onContinue} className="mx-auto mt-8">
          Continue in browser
        </Button>
      )}
    </div>
  )
}

function Steps({ children }: { children: ReactNode }) {
  return <ol className="space-y-3">{children}</ol>
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex items-center gap-4 rounded-2xl bg-bg p-4 ring-1 ring-line">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-contrast">
        {n}
      </span>
      <span className="text-body leading-snug">{children}</span>
    </li>
  )
}

const Glyph = ({ name }: { name: 'share' | 'plusSquare' }) => (
  <span className="mx-0.5 inline-flex translate-y-1 text-accent">
    <Icon name={name} size={20} />
  </span>
)

function IOSGuide() {
  return (
    <Steps>
      <Step n={1}>
        Tap <Glyph name="share" /> <strong>Share</strong> in the browser toolbar.
      </Step>
      <Step n={2}>
        Scroll down and tap <Glyph name="plusSquare" /> <strong>Add to Home Screen</strong>.
      </Step>
      <Step n={3}>
        Open <strong>Steady</strong> from your home screen. Set it up there.
      </Step>
    </Steps>
  )
}

function InAppGuide() {
  const [copied, setCopied] = useState(false)
  const url = `${location.origin}/`
  return (
    <div className="space-y-4">
      <Steps>
        <Step n={1}>
          Tap the <strong>•••</strong> or <Glyph name="share" /> menu in this app.
        </Step>
        <Step n={2}>
          Choose <strong>Open in Safari</strong> or <strong>Open in Chrome</strong>.
        </Step>
      </Steps>
      <p className="text-sm text-muted">No menu? Copy the link and paste it into your browser.</p>
      <div className="flex items-center gap-2 rounded-2xl bg-bg p-2 pl-4 ring-1 ring-line">
        <span className="min-w-0 flex-1 truncate font-medium">
          {url.replace(/^https?:\/\//, '')}
        </span>
        <Button
          variant={copied ? 'secondary' : 'primary'}
          icon={copied ? 'check' : 'copy'}
          onClick={async () => setCopied(await copyText(url))}
        >
          {copied ? 'Copied' : 'Copy link'}
        </Button>
      </div>
    </div>
  )
}

function PromptInstall() {
  const [outcome, setOutcome] = useState<string | null>(null)
  return (
    <div className="space-y-3">
      <p className="text-body text-muted">
        Get Steady on your home screen or dock. It opens instantly and works offline.
      </p>
      <Button
        size="lg"
        block
        icon="download"
        onClick={async () => setOutcome(await promptInstall())}
        disabled={outcome === 'accepted'}
      >
        {outcome === 'accepted' ? 'Installing…' : 'Install app'}
      </Button>
      {outcome === 'accepted' && (
        <p role="status" className="text-center text-sm text-muted">
          Done. Open Steady from your home screen or app list.
        </p>
      )}
    </div>
  )
}

function MenuInstall() {
  return (
    <Steps>
      <Step n={1}>
        Open your browser menu (<strong>⋮</strong>, <strong>•••</strong> or <Glyph name="share" />
        ).
      </Step>
      <Step n={2}>
        Choose <strong>Install app</strong>, <strong>Add to Home Screen</strong> or{' '}
        <strong>Add to Dock</strong>.
      </Step>
    </Steps>
  )
}
