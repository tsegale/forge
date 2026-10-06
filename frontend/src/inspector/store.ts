/**
 * The API Inspector's record of recent calls: what the page asked the backend, what came back,
 * how long it took and where (the backend's Server-Timing: app and PostgreSQL), and the request
 * id that ties it to the server logs. Kept in memory for this tab only, last 50 calls.
 * Secrets are redacted before anything is stored: tokens, passwords and client secrets never
 * appear, and the Authorization header is not recorded at all.
 */
import { useSyncExternalStore } from 'react'

export interface Timing {
  appMs: number | null
  dbMs: number | null
  statements: number | null
}

export interface ApiCall {
  id: number
  method: string
  path: string
  status: number | null
  startedAt: number
  durationMs: number | null
  requestId: string | null
  timing: Timing | null
  requestBody: string | null
  responseBody: string | null
  errorCode: string | null
}

const LIMIT = 50
const BODY_LIMIT = 20_000
const SECRET_KEYS = /^(password|token|access_token|refresh_token|client_secret|secret)$/i

let calls: ApiCall[] = []
let nextId = 1
let open = false
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Replace secret values anywhere in a JSON document; anything else is returned as text, cut short. */
export function redact(text: string): string {
  if (!text) return text
  try {
    const value: unknown = JSON.parse(text)
    const walk = (node: unknown): unknown => {
      if (Array.isArray(node)) return node.map(walk)
      if (node && typeof node === 'object') {
        return Object.fromEntries(
          Object.entries(node).map(([key, v]) => [key, SECRET_KEYS.test(key) ? '[redacted]' : walk(v)]),
        )
      }
      return node
    }
    const pretty = JSON.stringify(walk(value), null, 2)
    return pretty.length > BODY_LIMIT ? `${pretty.slice(0, BODY_LIMIT)}\n... (truncated)` : pretty
  } catch {
    return text.length > BODY_LIMIT ? `${text.slice(0, BODY_LIMIT)}... (truncated)` : text
  }
}

/** `app;dur=12.3;desc="Flask", db;dur=4.1;desc="PostgreSQL, 3 statements"` */
export function parseServerTiming(header: string | null): Timing | null {
  if (!header) return null
  const metric = (name: string) =>
    new RegExp(`(?:^|,)\\s*${name};dur=([\\d.]+)(?:;desc="([^"]*)")?`).exec(header)
  const app = metric('app')
  const db = metric('db')
  const statements = db?.[2] ? /(\d+) statements?/.exec(db[2])?.[1] : undefined
  return {
    appMs: app?.[1] ? Number(app[1]) : null,
    dbMs: db?.[1] ? Number(db[1]) : null,
    statements: statements ? Number(statements) : null,
  }
}

export function startCall(method: string, path: string, requestBody: string | null): number {
  const id = nextId++
  calls = [
    {
      id,
      method,
      path,
      status: null,
      startedAt: Date.now(),
      durationMs: null,
      requestId: null,
      timing: null,
      requestBody: requestBody ? redact(requestBody) : null,
      responseBody: null,
      errorCode: null,
    },
    ...calls,
  ].slice(0, LIMIT)
  emit()
  return id
}

export function finishCall(id: number, update: Partial<ApiCall>): void {
  calls = calls.map((call) =>
    call.id === id ? { ...call, ...update, durationMs: Date.now() - call.startedAt } : call,
  )
  emit()
}

export function clearCalls(): void {
  calls = []
  emit()
}

export function setInspectorOpen(next: boolean): void {
  open = next
  emit()
}

export function useApiCalls(): ApiCall[] {
  return useSyncExternalStore(
    subscribe,
    () => calls,
    () => calls,
  )
}

export function useInspectorOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => open,
    () => open,
  )
}
