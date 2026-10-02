/** Only same-site paths are honoured as a return target (no open redirects). */
export function safeNext(next: string | null): string {
  return next?.startsWith('/') && !next.startsWith('//') ? next : '/'
}
