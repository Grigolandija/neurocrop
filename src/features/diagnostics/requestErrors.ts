export function diagnosticErrorMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : ''
  const message = error instanceof Error ? error.message : String(error)
  return name === 'TimeoutError' || /timed?\s*out|timeout|gateway time-out/i.test(message)
    ? 'diagnostic-timeout'
    : message
}
