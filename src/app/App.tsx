import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { BackupScreen } from '../features/backup/BackupScreen'
import { BillsScreen } from '../features/bills/BillsScreen'
import { GoalsScreen } from '../features/goals/GoalsScreen'
import { InstallGate } from '../features/install/InstallGate'
import { InstallScreen } from '../features/install/InstallScreen'
import { MoreScreen } from '../features/more/MoreScreen'
import { PlanScreen } from '../features/plan/PlanScreen'
import { SettingsScreen } from '../features/settings/SettingsScreen'
import { TodayScreen } from '../features/today/TodayScreen'
import { ToastProvider } from '../ui/Toast'
import { AppShell } from './AppShell'
import { Boot } from './Boot'
import { FullOnly, StartRoute } from './routes'
import { SettingsProvider } from './SettingsProvider'

// Every tab is imported eagerly (PLAN §5): after an update, a lazy chunk the old page
// asks for may no longer exist on the server. Only heavy secondary views go lazy.
export function App() {
  return (
    <Boot>
      <BrowserRouter>
        <SettingsProvider>
          <ToastProvider>
            <InstallGate>
              <Routes>
                <Route element={<AppShell />}>
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
                  <Route path="more/backup" element={<BackupScreen />} />
                  <Route path="more/install" element={<InstallScreen embedded />} />
                  <Route path="start" element={<StartRoute />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </InstallGate>
          </ToastProvider>
        </SettingsProvider>
      </BrowserRouter>
    </Boot>
  )
}
