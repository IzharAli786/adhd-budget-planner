import { useLiveQuery } from 'dexie-react-hooks'
import { useAppSettings } from '../../app/SettingsProvider'
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

export function MoreScreen() {
  const { settings, update } = useAppSettings()
  const lastBackupAt = useLiveQuery(() => getMeta<Instant>('lastBackupAt'))
  const changes = useLiveQuery(getChangesSinceBackup)
  const undoLabel = useUndoLabel()
  const deleted = useRecentlyDeleted()
  const toast = useToast()
  const showInstall = INSTALL_FLOW && !isStandalone()

  return (
    <>
      <PageHeader title="More" />
      <div className="space-y-7">
        {IS_DEMO && <DemoMoreGroup />}
        <ListGroup>
          <ListRow
            icon="sparkle"
            label="Show more tools"
            detail="Adds Plan and Goals: savings, debts, envelopes."
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
            icon="list"
            label="Transactions"
            detail="Everything you’ve logged, by day"
            to="/more/transactions"
          />
          <ListRow
            icon="history"
            label="Look back"
            detail="Your year by month or payday, ready to print"
            to="/more/review"
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
          {/* Full mode keeps the 48-hour list in Goals (PLAN §5). */}
          {settings.simpleMode && (
            <ListRow
              icon="clock"
              label="48-hour list"
              detail="Wait two days before buying, then decide"
              to="/more/wait"
            />
          )}
          {/* Full mode has debts in Goals; Simple mode keeps them one tap away here. */}
          {settings.simpleMode && (
            <ListRow
              icon="goals"
              label="Debt payoff"
              detail="Snowball or avalanche, and when you’re done"
              to="/more/debts"
            />
          )}
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

        <ListGroup title="Make it yours">
          <ListRow
            icon="palette"
            label="Appearance & settings"
            detail="Theme, text size, currency, dates"
            to="/more/settings"
          />
        </ListGroup>

        <p className="px-1 text-center text-sm text-muted">
          Steady keeps everything on this device. No account, no tracking.
          <br />
          Estimates only, not financial advice.
        </p>
      </div>
    </>
  )
}
