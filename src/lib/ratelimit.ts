import { Ratelimit, type Duration } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

type RateLimitKind = 'forgot-password' | 'reset-password'

const globalForRedis = globalThis as unknown as { redis?: Redis }

const getRedis = (): Redis | null => {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) {
    return null
  }

  if (!globalForRedis.redis) {
    globalForRedis.redis = new Redis({ url, token })
  }

  return globalForRedis.redis
}

const windowSize: Duration = '15 m'
const redis = getRedis()

const forgotPasswordLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, windowSize),
      prefix: 'rl:auth:forgot-password',
    })
  : null

const resetPasswordLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, windowSize),
      prefix: 'rl:auth:reset-password',
    })
  : null

const getLimiter = (kind: RateLimitKind) => {
  if (kind === 'forgot-password') {
    return forgotPasswordLimiter
  }

  return resetPasswordLimiter
}

export const isRateLimited = async (
  kind: RateLimitKind,
  identifier: string,
): Promise<boolean> => {
  const limiter = getLimiter(kind)

  if (!limiter) {
    return false
  }

  const result = await limiter.limit(identifier)
  return !result.success
}
