export type DiagnosticEvent = {
  readonly code: string
  readonly [field: string]: unknown
}

export type DiagnosticLogger = (event: DiagnosticEvent) => void

export function sourceOffset(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  if (!('offset' in error)) return undefined
  const offset = Reflect.get(error, 'offset')
  return typeof offset === 'number' && Number.isFinite(offset)
    ? offset
    : undefined
}

export class Diagnostics {
  private enabled = false
  private logger: DiagnosticLogger | undefined

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  setLogger(logger: DiagnosticLogger | undefined): void {
    this.logger = logger
  }

  emit(build: () => DiagnosticEvent): void {
    if (!this.enabled) return
    const logger = this.logger
    if (logger === undefined) return
    logger(build())
  }
}
