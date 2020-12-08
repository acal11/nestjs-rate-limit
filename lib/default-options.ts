import { RateLimiterModuleOptions } from './rate-limiter.interface';

export const defaultRateLimiterOptions: RateLimiterModuleOptions = {
    type: 'Memory',
    points: 4,
    duration: 1,
    pointsConsumed: 1,
    headers: true,
    keyGenerator: (request: any) => (request.user ? request.user.id : request.ip),
};
