import { describe, expect, it } from 'vitest'
import { ordinalDay } from './dates'

describe('ordinalDay', () => {
  it('uses the right suffix', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinalDay)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '31st',
    ])
  })
})
