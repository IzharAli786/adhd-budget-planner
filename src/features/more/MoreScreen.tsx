import { useLiveQuery } from 'dexie-react-hooks'
import { useAppSettings } from '../../app/SettingsProvider'
import { visibleTabs } from '../../app/tabs'
import { useRecentlyDeleted, useUndoLabel } from '../../db/hooks'
import { getChangesSinceBackup, getMeta } from '../../db/repos'
import { undoLast } from '../../db/undo'
import type { Instant } from '../../domain/types'
import { IS_DEMO } from '../../lib/demo'
import { INSTALL_FLOW, isStandalone } from '../../lib/install'
import { ListGroup, ListRow } from '../../ui/List'
import { PageHeader } from '../../ui/PageHeader'
import { Switch } from '../../ui/Switch'
import { useToast } from '../../ui/Toast'
import { relativeDays } from '../backup/relative'
import { DemoMoreGroup } from '../demo/DemoMore'

// One line on each section the phone's tab bar has no room for, keyed by route.
const SECTION_DETAIL: Readonly<Record<string, string>> = {
  '/getting-started': 'Currency, balance and a short tour',
  '/goals': 'Life goals, no-spend days, the garden',
  '/savings': 'Your funds and how close each is',
  '/debt': 'What you owe and the plan to clear it',
  '/review': 'Your year, ready to print',
  '/more/settings': 'Name, theme, text size, backups',
}

export function MoreScreen() {
  const { settings, update } = useAppSettings()
  const lastBackupAt = useLiveQuery(() => getMeta<Instant>('lastBackupAt'))
  const changes = useLiveQuery(getChangesSinceBackup)
  const undoLabel = useUndoLabel()
  const deleted = useRecentlyDeleted()
  const toast = useToast()
  const showInstall = INSTALL_FLOW && !isStandalone()
  // Every section that isn't in the phone's tab bar, in the menu's own order.
  const sections = visibleTabs(settings.simpleMode).filter((t) => !t.phone)

  return (
    <>
      <PageHeader title="More" />
      {/* Desktop: the groups flow into two balanced columns (CSS columns, so a short group
          never leaves a hole beside a tall one) instead of one long narrow list. */}
      <div className="space-y-7 lg:columns-2 lg:gap-8 lg:space-y-0 lg:[&>*]:mb-7 lg:[&>*]:break-inside-avoid">
        {/* First: on a phone this is the only way to the sections the bar can't hold. */}
        <ListGroup title="Sections">
          {sections.map((tab) => (
            <ListRow
              key={tab.to}
              icon={tab.icon}
              label={tab.label}
              detail={SECTION_DETAIL[tab.to]}
              to={tab.to}
            />
          ))}
        </ListGroup>
        {IS_DEMO && <DemoMoreGroup />}

        <ListGroup>
          <ListRow
            icon="sparkle"
            label="Show more tools"
            detail="Home, Goals, Savings, Debt, Envelopes and the yearly review. Off for a simpler app."
            trailing={
              <Switch
                label="Show more tools"
                checked={!settings.simpleMode}
                onChange={(on) => void update({ simpleMode: !on })}
              />
            }
          />
        </ListGroup>

        <ListGroup title="Your money">
          <ListRow
            icon="wallet"
            label="Money basics"
            detail="Currency, starting balance, roll over, month or payday"
            to="/more/basics"
          />
          <ListRow
            icon="list"
            label="Transactions"
            detail="Everything you’ve logged, by day"
            to="/more/transactions"
          />
          <ListRow
            icon="report"
            label="Reports"
            detail="A PDF of everything between two dates"
            to="/more/reports"
          />
          <ListRow
            icon="trash"
            label="Recently deleted"
            detail={
              deleted?.length
                ? `${deleted.length} ${deleted.length === 1 ? 'item' : 'items'}, kept for 30 days`
                : 'Nothing deleted'
            }
            to="/more/deleted"
          />
          {/* The persisted undo log (PLAN §8): survives a reload, so it lives here too,
              not only in the 10 s toast. */}
          {undoLabel ? (
            <ListRow
              icon="refresh"
              label="Undo last change"
              detail={undoLabel}
              onClick={async () => {
                const label = await undoLast()
                if (label) toast.show({ message: `Undone: ${label}` })
              }}
            />
          ) : (
            <ListRow icon="refresh" label="Undo last change" detail="Nothing to undo" />
          )}
          {/* Also under Goals; here so Simple mode, which has no Goals, keeps it. */}
          <ListRow
            icon="clock"
            label="48-hour list"
            detail="Wait two days before buying, then decide"
            to="/more/wait"
          />
        </ListGroup>

        <ListGroup title="Your data">
          <ListRow
            icon="shield"
            label="Backup & restore"
            detail={
              lastBackupAt
                ? `Last backup ${relativeDays(lastBackupAt)}${changes ? ` · ${changes} ${changes === 1 ? 'change' : 'changes'} since` : ''}`
                : 'No backup yet'
            }
            to="/more/backup"
          />
          {showInstall && (
            <ListRow
              icon="phone"
              label="Install the app"
              detail="Works offline and keeps your data safer."
              to="/more/install"
            />
          )}
        </ListGroup>

        <ListGroup title="Help">
          <ListRow
            icon="info"
            label="How each part works"
            detail="Each section in a few lines, and common questions"
            to="/more/help"
          />
        </ListGroup>

        <p className="px-1 text-center text-sm text-muted lg:pt-6 lg:[column-span:all]">
          Steady keeps everything on this device. No account, no tracking.
          <br />
          Estimates only, not financial advice.
        </p>
      </div>
    </>
  )
}
