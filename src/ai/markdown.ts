/**
 * The slice of Markdown a chat assistant writes when asked to be concise and use tables:
 * headings, paragraphs, bullet and numbered lists, pipe tables. Parsed into blocks here;
 * `components/Markdown.tsx` turns the blocks into elements, so no HTML is ever injected.
 */

export type Block =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'table'; header: string[]; rows: string[][] }

/** The `| --- | :-: |` line under a table's header row. */
const SEPARATOR = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/
const HEADING = /^#{1,6}\s+(.*)$/
const ITEM = /^([-*+]|\d+[.)])\s+(.*)$/
const RULE = /^([-*_]\s*){3,}$/

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())

export function parseMarkdown(md: string): Block[] {
  const out: Block[] = []
  const lines = md.split('\n')
  let para: string[] = []
  const flush = () => {
    if (para.length) out.push({ type: 'paragraph', text: para.join(' ') })
    para = []
  }
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    if (!t || RULE.test(t)) {
      flush()
      continue
    }
    const heading = HEADING.exec(t)
    if (heading) {
      flush()
      out.push({ type: 'heading', text: heading[1].trim() })
      continue
    }
    // A table needs its separator line; until it has streamed in, the header reads as text.
    if (t.startsWith('|') && i + 1 < lines.length && SEPARATOR.test(lines[i + 1].trim())) {
      flush()
      const header = cells(t)
      const rows: string[][] = []
      for (i += 2; i < lines.length && lines[i].trim().startsWith('|'); i++) rows.push(cells(lines[i]))
      i--
      out.push({ type: 'table', header, rows })
      continue
    }
    const item = ITEM.exec(t)
    if (item) {
      flush()
      const ordered = /\d/.test(item[1])
      const last = out[out.length - 1]
      if (last?.type === 'list' && last.ordered === ordered) last.items.push(item[2])
      else out.push({ type: 'list', ordered, items: [item[2]] })
      continue
    }
    para.push(t)
  }
  flush()
  return out
}
