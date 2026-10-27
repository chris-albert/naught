import { describe, expect, it } from 'vitest'
import { maskApiKey, parseApiKey } from './apiKey'

describe('parseApiKey', () => {
  it('accepts a key with surrounding whitespace', () => {
    expect(parseApiKey('  sk-ant-api03-abcdefghijklmnop\n')).toBe('sk-ant-api03-abcdefghijklmnop')
  })
  it('rejects empty input, the wrong prefix, and a bare prefix', () => {
    expect(parseApiKey('')).toBeUndefined()
    expect(parseApiKey('sk-proj-abcdefghijklmnop')).toBeUndefined()
    expect(parseApiKey('sk-ant-')).toBeUndefined()
  })
  it('rejects a key with whitespace inside it', () => {
    expect(parseApiKey('sk-ant-api03-abcd efghijklmnop')).toBeUndefined()
  })
})

describe('maskApiKey', () => {
  it('keeps only the prefix and the last four characters', () => {
    expect(maskApiKey('sk-ant-api03-abcdefghijklmnop')).toBe('sk-ant-…mnop')
  })
})
