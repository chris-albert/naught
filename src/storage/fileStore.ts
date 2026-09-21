import { del, get, set } from 'idb-keyval'
import type { BudgetFile } from '../model/types'

const HANDLE_KEY = 'naught.fileHandle'

export const supportsFileSystemAccess =
  typeof window !== 'undefined' && 'showOpenFilePicker' in window && 'showSaveFilePicker' in window

const pickerTypes: FilePickerAcceptType[] = [{ description: 'Naught budget', accept: { 'application/json': ['.naught.json', '.json'] } }]

export interface OpenedFile {
  handle: FileSystemFileHandle
  data: BudgetFile
}

export async function openExistingFile(): Promise<OpenedFile | null> {
  try {
    const [handle] = await window.showOpenFilePicker({ types: pickerTypes, multiple: false })
    const data = await readHandle(handle)
    await set(HANDLE_KEY, handle)
    return { handle, data }
  } catch (e) {
    if ((e as DOMException).name === 'AbortError') return null
    throw e
  }
}

export async function createNewFile(data: BudgetFile): Promise<FileSystemFileHandle | null> {
  try {
    const handle = await window.showSaveFilePicker({
      types: pickerTypes,
      suggestedName: `${data.name || 'budget'}.naught.json`,
    })
    await writeHandle(handle, data)
    await set(HANDLE_KEY, handle)
    return handle
  } catch (e) {
    if ((e as DOMException).name === 'AbortError') return null
    throw e
  }
}

/** Returns the remembered handle, if any. Permission may still need to be granted. */
export async function rememberedHandle(): Promise<FileSystemFileHandle | undefined> {
  return get<FileSystemFileHandle>(HANDLE_KEY)
}

export async function hasPermission(handle: FileSystemFileHandle): Promise<boolean> {
  return (await handle.queryPermission({ mode: 'readwrite' })) === 'granted'
}

/** Must be called from a user gesture (click). */
export async function requestPermission(handle: FileSystemFileHandle): Promise<boolean> {
  return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted'
}

export async function forgetHandle(): Promise<void> {
  await del(HANDLE_KEY)
}

export async function readHandle(handle: FileSystemFileHandle): Promise<BudgetFile> {
  const file = await handle.getFile()
  const parsed = JSON.parse(await file.text()) as BudgetFile
  if (parsed.version !== 1) throw new Error(`Unsupported file version: ${String(parsed.version)}`)
  return parsed
}

export async function writeHandle(handle: FileSystemFileHandle, data: BudgetFile): Promise<void> {
  const writable = await handle.createWritable()
  await writable.write(JSON.stringify(data))
  await writable.close()
}

/** Fallback that works in every browser. */
export function downloadBackup(data: BudgetFile): void {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${data.name || 'budget'}.naught.json`
  a.click()
  URL.revokeObjectURL(url)
}
