import { NavLink } from 'react-router-dom'

const TABS: [string, string][] = [
  ['/app/reports', 'Overview'],
  ['/app/reports/month', 'This month'],
  ['/app/reports/trends', 'Trends'],
  ['/app/reports/insights', 'Insights'],
  ['/app/reports/net-worth', 'Net worth'],
  ['/app/reports/year', 'Year in review'],
]

/** Tab strip shared by the report pages. */
export function ReportsNav() {
  return (
    <nav className="report-tabs">
      {TABS.map(([to, label]) => (
        <NavLink key={to} to={to} end={to === '/app/reports'}>
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
