import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { Fragment } from 'react'
import { BackupScreen } from '../features/backup/BackupScreen'
import { BillsScreen } from '../features/bills/BillsScreen'
import { DemoGate } from '../features/demo/DemoGate'
import { BringSetupScreen } from '../features/demo/DemoMore'
import { RecentlyDeletedScreen } from '../features/deleted/RecentlyDeletedScreen'
import { DebtsScreen } from '../features/debts/DebtsScreen'
import { GoalsScreen } from '../features/goals/GoalsScreen'
import { ImpulseScreen } from '../features/impulse/ImpulseScreen'
import { InstallGate } from '../features/install/InstallGate'
import { InstallScreen } from '../features/install/InstallScreen'
import { HelpScreen } from '../features/more/HelpScreen'
import { MoreScreen } from '../features/more/MoreScreen'
import { PlanScreen } from '../features/plan/PlanScreen'
import { SettingsScreen } from '../features/settings/SettingsScreen'
import { RequireSetup } from '../features/setup/RequireSetup'
import { SetupScreen } from '../features/setup/SetupScreen'
import { TodayScreen } from '../features/today/TodayScreen'
import { TransactionsScreen } from '../features/transactions/TransactionsScreen'
import { UnlockGate } from '../features/unlock/UnlockGate'
import { IS_DEMO } from '../lib/demo'
import { ToastProvider } from '../ui/Toast'
import { AppShell } from './AppShell'
import { Boot } from './Boot'
import { FullOnly, StartRoute } from './routes'
import { SettingsProvider } from './SettingsProvider'

// The demo's gate (banner, two ways in, cap, reset). A Fragment in the full app, where
// IS_DEMO is the constant false and the demo code drops out of the bundle.
const Demo = IS_DEMO ? DemoGate : Fragment

// Gates, outside in: storage open, install (iOS), unlock code, demo, first-run setup.
// Every tab is imported eagerly (PLAN §5): after an update, a lazy chunk the old page
// asks for may no longer exist on the server. Only heavy secondary views go lazy.
export function App() {
  return (
    <Boot>
      <BrowserRouter>
        <SettingsProvider>
          <ToastProvider>
            <InstallGate>
              <UnlockGate>
                <Demo>
                  <Routes>
                    <Route path="setup" element={<SetupScreen />} />
                    <Route
                      element={
                        <RequireSetup>
                          <AppShell />
                        </RequireSetup>
                      }
                    >
                      <Route index element={<TodayScreen />} />
                      <Route path="bills" element={<BillsScreen />} />
                      <Route
                        path="plan"
                        element={
                          <FullOnly>
                            <PlanScreen />
                          </FullOnly>
                        }
                      />
                      <Route
                        path="goals"
                        element={
                          <FullOnly>
                            <GoalsScreen />
                          </FullOnly>
                        }
                      />
                      <Route path="more" element={<MoreScreen />} />
                      <Route path="more/settings" element={<SettingsScreen />} />
                      <Route path="more/help" element={<HelpScreen />} />
                      <Route path="more/backup" element={<BackupScreen />} />
                      <Route path="more/transactions" element={<TransactionsScreen />} />
                      <Route path="more/deleted" element={<RecentlyDeletedScreen />} />
                      <Route path="more/wait" element={<ImpulseScreen />} />
                      <Route path="more/debts" element={<DebtsScreen />} />
                      <Route path="more/install" element={<InstallScreen embedded />} />
                      {IS_DEMO && <Route path="more/bring" element={<BringSetupScreen />} />}
                      <Route path="start" element={<StartRoute />} />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Route>
                  </Routes>
                </Demo>
              </UnlockGate>
            </InstallGate>
          </ToastProvider>
        </SettingsProvider>
      </BrowserRouter>
    </Boot>
  )
}
