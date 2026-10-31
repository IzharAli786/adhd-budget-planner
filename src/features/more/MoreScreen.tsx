import { useLiveQuery } from 'dexie-react-hooks'
import { useAppSettings } from '../../app/SettingsProvider'
import { getMeta } from '../../db/repos'
import type { Instant } from '../../domain/types'
import { INSTALL_FLOW, isStandalone } from '../../lib/install'
import { ListGroup, ListRow } from '../../ui/List'
import { PageHeader } from '../../ui/PageHeader'
import { Switch } from '../../ui/Switch'
import { relativeDays } from '../backup/relative'

export function MoreScreen() {
  const { settings, update } = useAppSettings()
  const lastBackupAt = useLiveQuery(() => getMeta<Instant>('lastBackupAt'))
  const showInstall = INSTALL_FLOW && !isStandalone()

  return (
    <>
      <PageHeader title="More" />
      <div className="space-y-7">
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

        <ListGroup title="Your data">
          <ListRow
            icon="shield"
            label="Backup & restore"
            detail={lastBackupAt ? `Last backup ${relativeDays(lastBackupAt)}` : 'No backup yet'}
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
            detail="Theme, dark mode, text size, motion"
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
