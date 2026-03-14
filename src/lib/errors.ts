export type AppErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL_SERVER_ERROR'

const statusCodeByError: Record<AppErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
}

export class AppError extends Error {
  readonly code: AppErrorCode
  readonly status: number
  readonly field?: string

  constructor(code: AppErrorCode, message: string, field?: string) {
    super(message)
    this.code = code
    this.status = statusCodeByError[code]
    this.field = field
    this.name = 'AppError'
  }
}

export const appError = (code: AppErrorCode, message: string, field?: string): AppError =>
  new AppError(code, message, field)

export const isAppError = (error: unknown): error is AppError => error instanceof AppError
