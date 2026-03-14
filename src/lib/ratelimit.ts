import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export function createRatelimit(requests: number, window: string): Ratelimit {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL ?? '',
    token: process.env.UPSTASH_REDIS_REST_TOKEN ?? '',
  });
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, window),
  });
}
