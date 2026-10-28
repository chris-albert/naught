import { NavLink } from 'react-router-dom'

const TABS: [string, string][] = [
  ['/app/settings/accounts', 'Accounts'],
  ['/app/settings/rules', 'Payee rules'],
  ['/app/settings/ai', 'AI'],
  ['/app/settings/file', 'File'],
]

/** Tab strip shared by the settings pages. */
export function SettingsNav() {
  return (
    <nav className="tabs">
      {TABS.map(([to, label]) => (
        <NavLink key={to} to={to}>
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
