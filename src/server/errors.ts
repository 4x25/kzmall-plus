export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly publicMessage: string,
    readonly retryAfter?: number,
  ) {
    super(publicMessage)
    this.name = 'AppError'
  }
}

export function errorResponse(error: AppError, requestId: string): Response {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-request-id': requestId,
  })
  if (error.retryAfter !== undefined) headers.set('retry-after', String(error.retryAfter))
  return new Response(JSON.stringify({
    error: {
      code: error.code,
      message: error.publicMessage,
      requestId,
    },
  }), { status: error.status, headers })
}

export function logEvent(
  level: 'info' | 'error',
  event: string,
  details: Record<string, string | number | boolean | null>,
): void {
  const output = JSON.stringify({ event, ...details })
  if (level === 'error') console.error(output)
  else console.info(output)
}
