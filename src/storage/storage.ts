import type { BudgetFile } from '../model/types'

/** Somewhere an open budget is saved to: a file on disk or a file in Google Drive. */
export interface BudgetStorage {
  /** Name of the file, for display. */
  name: string
  /** Throws ConflictError if the stored copy changed since we last read or wrote it, unless `overwrite`. */
  write(data: BudgetFile, overwrite?: boolean): Promise<void>
  /** The stored contents if they changed since we last read or wrote them, else null. */
  readIfChanged?(): Promise<BudgetFile | null>
  /** Earlier saved copies, for storage that keeps them. */
  versions?: {
    /** Newest first. */
    list(): Promise<BudgetVersion[]>
    read(id: string): Promise<BudgetFile>
  }
}

export interface BudgetVersion {
  id: string
  /** ISO timestamp of the save. */
  savedAt: string
  /** Bytes. */
  size: number
  /** Kept past the storage's normal retention. */
  kept: boolean
}

export interface OpenedBudget {
  data: BudgetFile
  storage: BudgetStorage
}

export class ConflictError extends Error {
  constructor() {
    super('The budget was changed on another device')
  }
}

export function parseBudgetFile(text: string): BudgetFile {
  const parsed = JSON.parse(text) as BudgetFile
  if (parsed.version !== 1) throw new Error(`Unsupported file version: ${String(parsed.version)}`)
  return parsed
}
