import { Fragment, useEffect, useMemo, useRef, useState } from 'react'

export interface PickerOption {
  /** Stable key; also the value passed to onChange. */
  key: string
  label: string
  group?: string
}

const MAX_SHOWN = 200

/**
 * Typeahead dropdown. With `allowCustom`, pressing Enter on text that matches
 * no option commits the typed text itself (used for payees).
 */
export function Picker({
  options,
  value,
  placeholder,
  allowCustom = false,
  buttonClassName = '',
  onChange,
}: {
  options: PickerOption[]
  value: string
  placeholder?: string
  allowCustom?: boolean
  buttonClassName?: string
  onChange: (key: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = q
      ? options.filter((o) => o.label.toLowerCase().includes(q) || o.group?.toLowerCase().includes(q))
      : options
    return matches.slice(0, MAX_SHOWN)
  }, [options, query])

  const trimmed = query.trim()
  const customAvailable = allowCustom && trimmed !== '' && !options.some((o) => o.label.toLowerCase() === trimmed.toLowerCase())
  // Row 0 is the "use typed text" row when it applies; option rows follow.
  const rowCount = filtered.length + (customAvailable ? 1 : 0)
  const optionIndex = (row: number) => row - (customAvailable ? 1 : 0)

  const current = options.find((o) => o.key === value)

  const openPicker = () => {
    const r = buttonRef.current!.getBoundingClientRect()
    setPos({ top: r.bottom + 2, left: r.left, width: Math.max(r.width, 260) })
    setQuery('')
    setActive(Math.max(0, options.findIndex((o) => o.key === value)))
    setOpen(true)
  }

  const commit = (key: string) => {
    if (key !== value) onChange(key)
    setOpen(false)
    buttonRef.current?.focus()
  }

  const chooseRow = (row: number) => {
    if (customAvailable && row === 0) commit(trimmed)
    else {
      const o = filtered[optionIndex(row)]
      if (o) commit(o.key)
    }
  }

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus({ preventScroll: true })
    const inside = (target: EventTarget | null) => popupRef.current?.contains(target as Node) ?? false
    const onDown = (e: MouseEvent) => {
      if (!inside(e.target) && e.target !== buttonRef.current) setOpen(false)
    }
    // Close when the page scrolls under the fixed popup, but not when the
    // list itself scrolls (keyboard navigation, scrollIntoView on open).
    const onScroll = (e: Event) => {
      if (!inside(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  useEffect(() => {
    listRef.current?.querySelector('li.active')?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, rowCount - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      chooseRow(active)
    } else if (e.key === 'Escape') {
      setOpen(false)
      buttonRef.current?.focus()
    }
  }

  return (
    <>
      <button ref={buttonRef} type="button" className={`picker-button ${current ? '' : 'muted'} ${buttonClassName}`} onClick={openPicker}>
        {current?.label ?? (value || placeholder || '—')}
      </button>
      {open && (
        <div ref={popupRef} className="picker-popup" style={pos}>
          <input
            ref={inputRef}
            className="picker-input"
            placeholder={placeholder ?? 'Type to search…'}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
          />
          <ul ref={listRef} className="picker-list">
            {customAvailable && (
              <li
                className={`custom ${active === 0 ? 'active' : ''}`}
                onMouseEnter={() => setActive(0)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  chooseRow(0)
                }}
              >
                Use “{trimmed}”
              </li>
            )}
            {filtered.map((o, i) => {
              const row = i + (customAvailable ? 1 : 0)
              return (
                <Fragment key={o.key}>
                  {o.group && o.group !== filtered[i - 1]?.group && <li className="heading">{o.group}</li>}
                  <li
                    className={`${row === active ? 'active' : ''} ${o.key === value ? 'selected' : ''}`}
                    onMouseEnter={() => setActive(row)}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      chooseRow(row)
                    }}
                  >
                    {o.label}
                  </li>
                </Fragment>
              )
            })}
            {rowCount === 0 && <li className="muted empty">No matches</li>}
            {filtered.length === MAX_SHOWN && <li className="muted empty">Type to narrow the list…</li>}
          </ul>
        </div>
      )}
    </>
  )
}
