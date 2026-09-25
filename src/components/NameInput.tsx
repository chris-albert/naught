import { useRef, useState } from 'react'

/** Text input that commits its trimmed value on Enter or blur, and cancels on Escape. */
export function NameInput({
  initial,
  placeholder,
  className,
  stayOpen = false,
  onCommit,
  onCancel,
}: {
  initial: string
  placeholder?: string
  className?: string
  /** After Enter, clear and keep focus instead of blurring (for adding several in a row). */
  stayOpen?: boolean
  onCommit: (name: string) => void
  onCancel: () => void
}) {
  const [text, setText] = useState(initial)
  const cancelled = useRef(false)

  return (
    <input
      autoFocus
      className={className}
      value={text}
      placeholder={placeholder}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (cancelled.current) return
        const name = text.trim()
        if (!name && initial) onCancel()
        else onCommit(name)
      }}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') {
          if (stayOpen && text.trim()) {
            onCommit(text.trim())
            setText('')
          } else e.currentTarget.blur()
        }
        if (e.key === 'Escape') {
          cancelled.current = true
          onCancel()
        }
      }}
    />
  )
}
