import { useMemo, type ReactNode } from 'react'
import { parseMarkdown } from '../ai/markdown'

/** `**bold**`, `` `code` `` and `*italic*` inside a line; everything else is plain text. */
const INLINE = /\*\*([^*]+)\*\*|`([^`]+)`|\*([^*\s][^*]*)\*/g

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push(text.slice(last, m.index))
    if (m[1] !== undefined) out.push(<strong key={m.index}>{m[1]}</strong>)
    else if (m[2] !== undefined) out.push(<code key={m.index}>{m[2]}</code>)
    else out.push(<em key={m.index}>{m[3]}</em>)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** Renders an assistant's Markdown answer as elements: headings, paragraphs, lists and tables. */
export function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text])
  return (
    <div className="markdown">
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'heading':
            return <h4 key={i}>{inline(b.text)}</h4>
          case 'paragraph':
            return <p key={i}>{inline(b.text)}</p>
          case 'list': {
            const items = b.items.map((item, j) => <li key={j}>{inline(item)}</li>)
            return b.ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>
          }
          case 'table':
            return (
              <table key={i} className="grid">
                <thead>
                  <tr>
                    {b.header.map((h, j) => (
                      <th key={j}>{inline(h)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((row, j) => (
                    <tr key={j}>
                      {row.map((cell, k) => (
                        <td key={k}>{inline(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )
        }
      })}
    </div>
  )
}
