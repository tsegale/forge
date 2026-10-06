/**
 * The current draft, shared by every component that uses it and kept in localStorage so it
 * survives reloads and stays in step across tabs. Storage can be unavailable (private windows,
 * blocked site data); the draft then lives in memory only.
 */
import { useSyncExternalStore } from 'react'
import { onSessionEnded } from '@/auth/session'
import { emptyDraft, type Draft } from './draft'

const STORAGE_KEY = 'forge.build-draft.v1'

const isId = (value: unknown) => value === null || typeof value === 'number'

function isDraft(value: unknown): value is Draft {
  if (typeof value !== 'object' || value === null) return false
  const draft = value as Partial<Draft>
  return (
    typeof draft.name === 'string' &&
    isId(draft.buildId) &&
    isId(draft.ownerId ?? null) &&
    Array.isArray(draft.items)
  )
}

function load(): Draft {
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    // A draft stored before owners were recorded has none, so a linked one is treated as foreign.
    return isDraft(parsed) ? { ...parsed, ownerId: parsed.ownerId ?? null } : emptyDraft()
  } catch {
    return emptyDraft() // unreadable or corrupt storage: start fresh
  }
}

const listeners = new Set<() => void>()
// After the helpers above: load() uses them, and a const read before its declaration throws.
let current: Draft = load()

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

/**
 * Called whenever the session settles. Sign-out clears a linked draft, but a session can also end
 * while the app is closed (expired refresh token, cleared cookies); then the next visit finds a
 * draft linked to an account that is not the one signed in, or to none. Drop it the same way.
 */
export function reconcileDraftOwner(userId: number | null): void {
  if (current.buildId !== null && current.ownerId !== userId) clearDraft()
}

export function useDraft(): Draft {
  return useSyncExternalStore(subscribe, getDraft, getDraft)
}
