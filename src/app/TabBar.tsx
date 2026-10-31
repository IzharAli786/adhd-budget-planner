import { NavLink } from 'react-router'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { useAppSettings } from './SettingsProvider'
import { visibleTabs } from './tabs'

// One <nav>, two layouts: a bottom bar in thumb reach on phones, a side rail from md up
// where a bottom bar would stretch across a wide screen.
export function TabBar() {
  const { settings } = useAppSettings()
  const tabs = visibleTabs(settings.simpleMode)

  return (
    <nav
      aria-label="Main"
      className={cx(
        'fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl',
        // The demo's sticky banner sets --demo-banner-h; the rail starts below it.
        'md:top-[var(--demo-banner-h,0px)] md:right-auto md:w-24 md:border-t-0 md:border-r md:bg-surface/60 md:pt-[max(env(safe-area-inset-top),1.5rem)] md:[@media(max-height:30rem)]:pt-[max(env(safe-area-inset-top),0.75rem)] lg:w-56',
        // A column whose bottom is kept free for the floating +: the tabs scroll above it
        // when a short window (a phone on its side) can't fit them all, so the + can never
        // sit on the last tab.
        'md:flex md:flex-col md:pb-28',
      )}
    >
      <div className="hidden items-center gap-2.5 px-6 pb-8 md:flex md:justify-center lg:justify-start md:[@media(max-height:30rem)]:hidden">
        <img src="/icon.svg" alt="" width={32} height={32} className="rounded-[0.6rem]" />
        <span className="hidden text-heading tracking-tight lg:inline">Steady</span>
      </div>
      <div className="md:min-h-0 md:flex-1 md:overflow-y-auto md:overscroll-contain md:[scrollbar-width:none]">
        <ul className="mx-auto flex max-w-md md:max-w-none md:flex-col md:gap-1 md:px-3">
          {tabs.map((tab) => (
            <li key={tab.to} className="flex-1 md:flex-none">
              <NavLink
                to={tab.to}
                end={tab.to === '/'}
                className={({ isActive }) =>
                  cx(
                    'group flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium transition-colors',
                    'md:min-h-16 md:rounded-2xl md:[@media(max-height:30rem)]:min-h-12 lg:flex-row lg:justify-start lg:gap-3 lg:px-4 lg:text-body',
                    isActive ? 'text-accent' : 'text-muted hover:text-text',
                    isActive && 'md:bg-accent-soft',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cx(
                        'flex h-7 w-12 items-center justify-center rounded-full transition-colors md:h-8',
                        isActive && 'bg-accent-soft md:bg-transparent',
                      )}
                    >
                      <Icon name={tab.icon} size={22} strokeWidth={isActive ? 2.1 : 1.75} />
                    </span>
                    <span>{tab.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  )
}
