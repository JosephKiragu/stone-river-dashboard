export class AppError extends Error {
  readonly statusCode: number
  readonly field?: string

  constructor(message: string, statusCode: number, field?: string) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.field = field
  }
}

export function mapErrorToStatus(error: unknown): { status: number; body: { error: string; field?: string } } {
  if (error instanceof AppError) {
    return {
      status: error.statusCode,
      body: {
        error: error.message,
        ...(error.field ? { field: error.field } : {}),
      },
    }
  }

  if (error instanceof Error && error.name === 'ZodError') {
    return { status: 400, body: { error: 'Invalid request payload' } }
  }

  return { status: 500, body: { error: 'Internal server error' } }
}
