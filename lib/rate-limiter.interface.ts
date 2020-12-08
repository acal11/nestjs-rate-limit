import { ModuleMetadata, Type } from '@nestjs/common/interfaces';

import { IRateLimiterMongoOptions } from 'rate-limiter-flexible';
import { Provider } from '@nestjs/common';

export type RateLimiterType = 'Redis' | 'Memcache' | 'Postgres' | 'MySQL' | 'Memory';

export interface RateLimiterModuleOptions extends Partial<IRateLimiterMongoOptions> {
    type?: RateLimiterType;
    pointsConsumed?: number;
    headers?: boolean;
    keyGenerator?: (req: any) => string;
}

export interface RateLimiterOptionsFactory {
    createRateLimiterOptions(): Promise<RateLimiterModuleOptions> | RateLimiterModuleOptions;
}

export interface RateLimiterModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
    useExisting?: Type<RateLimiterOptionsFactory>;
    useClass?: Type<RateLimiterOptionsFactory>;
    useFactory?: (...args: any[]) => Promise<RateLimiterModuleOptions> | RateLimiterModuleOptions;
    inject?: any[];
    extraProviders?: Provider[];
}
