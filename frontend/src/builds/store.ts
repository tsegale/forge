/**
 * The current draft, shared by every component that uses it and kept in localStorage so it
 * survives reloads and stays in step across tabs. Storage can be unavailable (private windows,
 * blocked site data); the draft then lives in memory only.
 */
import { useSyncExternalStore } from 'react'
import { onSessionEnded } from '@/auth/session'
import { emptyDraft, type Draft } from './draft'

const STORAGE_KEY = 'forge.build-draft.v1'

const listeners = new Set<() => void>()
let current: Draft = load()

function isDraft(value: unknown): value is Draft {
  if (typeof value !== 'object' || value === null) return false
  const draft = value as Partial<Draft>
  return (
    typeof draft.name === 'string' &&
    (draft.buildId === null || typeof draft.buildId === 'number') &&
    Array.isArray(draft.items)
  )
}

function load(): Draft {
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return isDraft(parsed) ? parsed : emptyDraft()
  } catch {
    return emptyDraft() // unreadable or corrupt storage: start fresh
  }
}

function emit(): void {
  for (const listener of listeners) listener()
}

export function getDraft(): Draft {
  return current
}

export function setDraft(next: Draft | ((draft: Draft) => Draft)): void {
  current = typeof next === 'function' ? next(current) : next
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  } catch {
    // Storage full or blocked: the draft still works for this page, it just will not persist.
  }
  emit()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Another tab changed the draft.
globalThis.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY) return
  current = load()
  emit()
})

/** Forget the draft entirely, in memory and in storage. */
export function clearDraft(): void {
  current = emptyDraft()
  try {
    globalThis.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage blocked: nothing was persisted to remove.
  }
  emit()
}

// A build linked to an account is that account's data: never leave it in a shared browser after
// sign-out. Only a guest's unsaved build (no link) survives.
onSessionEnded(() => {
  if (current.buildId !== null) clearDraft()
})

export function useDraft(): Draft {
  return useSyncExternalStore(subscribe, getDraft, getDraft)
}
