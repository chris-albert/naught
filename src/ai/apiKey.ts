import { del, get, set } from 'idb-keyval'

/**
 * The Anthropic API key for the AI features. Kept in this browser's IndexedDB,
 * never in the budget file (which may be synced or shared). Each device
 * needs the key pasted once.
 */

const API_KEY_KEY = 'naught.anthropic.apiKey'

/** Anthropic keys start with this; anything else pasted is probably a mistake. */
export const KEY_PREFIX = 'sk-ant-'

/** Trim what was pasted and return it when it has the shape of an Anthropic key, else undefined. */
export function parseApiKey(raw: string): string | undefined {
  const key = raw.trim()
  return key.startsWith(KEY_PREFIX) && key.length > KEY_PREFIX.length + 8 && !/\s/.test(key) ? key : undefined
}

/** The key as it is shown on screen: the prefix and the last four characters. */
export function maskApiKey(key: string): string {
  return `${KEY_PREFIX}…${key.slice(-4)}`
}

export const getApiKey = () => get<string>(API_KEY_KEY)
export const setApiKey = (key: string) => set(API_KEY_KEY, key)
export const clearApiKey = () => del(API_KEY_KEY)
