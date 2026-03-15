export type AppErrorCode =
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'FORBIDDEN'
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'

export class AppError extends Error {
  constructor(public code: AppErrorCode, message: string, public field?: string) {
    super(message)
    this.name = 'AppError'
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError
}

export function toErrorResponse(err: AppError): { error: string; field?: string } {
  const result: { error: string; field?: string } = { error: err.message }
  if (err.field) {
    result.field = err.field
  }
  return result
}
