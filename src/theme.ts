export type Theme = 'system' | 'light' | 'dark'

const KEY = 'naught.theme'

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY)
    return t === 'light' || t === 'dark' ? t : 'system'
  } catch {
    return 'system'
  }
}

export function setTheme(theme: Theme): void {
  try {
    if (theme === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, theme)
  } catch {
    // storage unavailable; still apply for this session
  }
  if (theme === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = theme
}

export function nextTheme(theme: Theme): Theme {
  return theme === 'system' ? 'dark' : theme === 'dark' ? 'light' : 'system'
}
