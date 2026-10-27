import { describe, expect, it } from 'vitest'
import { parseMarkdown } from './markdown'

describe('parseMarkdown', () => {
  it('splits headings, paragraphs, lists and tables', () => {
    const md = [
      '## Annual subscriptions',
      '',
      '| Payee | Amount | Next renewal |',
      '|---|---:|---|',
      '| Adobe | $239.88 | 2027-01-03 |',
      '| Dropbox | $119.88 | 2027-02-14 |',
      '',
      'Two renewals in the next quarter.',
      'Both look current.',
      '',
      '1. Cancel Dropbox',
      '2. Keep Adobe',
      '- Check the card',
      '',
      '---',
      '* Done',
    ].join('\n')
    expect(parseMarkdown(md)).toEqual([
      { type: 'heading', text: 'Annual subscriptions' },
      { type: 'table', header: ['Payee', 'Amount', 'Next renewal'], rows: [['Adobe', '$239.88', '2027-01-03'], ['Dropbox', '$119.88', '2027-02-14']] },
      { type: 'paragraph', text: 'Two renewals in the next quarter. Both look current.' },
      { type: 'list', ordered: true, items: ['Cancel Dropbox', 'Keep Adobe'] },
      { type: 'list', ordered: false, items: ['Check the card', 'Done'] },
    ])
  })

  it('treats a table header as text until its separator line arrives', () => {
    expect(parseMarkdown('| Payee | Amount |')).toEqual([{ type: 'paragraph', text: '| Payee | Amount |' }])
    expect(parseMarkdown('| Payee | Amount |\n| --- | --- |')).toEqual([{ type: 'table', header: ['Payee', 'Amount'], rows: [] }])
  })

  it('returns nothing for blank input', () => {
    expect(parseMarkdown('')).toEqual([])
    expect(parseMarkdown('\n\n')).toEqual([])
  })
})
