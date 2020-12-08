import { ExecutionContext, HttpException } from '@nestjs/common';

import { RateLimiterMemory } from 'rate-limiter-flexible';
import { RateLimiterModuleOptions } from '../rate-limiter.interface';
import { RateLimiterService } from '../rate-limiter.service';
import { Reflector } from '@nestjs/core';
import { defaultRateLimiterOptions } from '../default-options';
import { fakeExecutionContext } from './util/fakeExecutionContext';

describe('service', () => {
    describe('getRateLimiter', () => {
        it('should use "Memory" by default', async () => {
            const rateLimiterService = new RateLimiterService(defaultRateLimiterOptions, new Reflector());
            const rateLimiter = await rateLimiterService.getRateLimiter('test');
            expect(rateLimiter).toBeInstanceOf(RateLimiterMemory);
        });

        it('should override root options with method specific options', async () => {
            const rateLimiterService = new RateLimiterService(
                { ...defaultRateLimiterOptions, type: 'Redis' },
                new Reflector(),
            );
            const rateLimiter = await rateLimiterService.getRateLimiter('test', { type: 'Memory' });
            expect(rateLimiter).toBeInstanceOf(RateLimiterMemory);
        });

        it('should retrieve and return an existing RateLimiter when the same keyPrefix is provided', async () => {
            const rateLimiterService = new RateLimiterService(defaultRateLimiterOptions, new Reflector());
            const rateLimiter1 = await rateLimiterService.getRateLimiter('test');
            const rateLimiter2 = await rateLimiterService.getRateLimiter('test');
            expect(rateLimiter1).toBe(rateLimiter2);
        });

        it('should create a new RateLimiter when a different keyPrefix is provided', async () => {
            const rateLimiterService = new RateLimiterService(defaultRateLimiterOptions, new Reflector());
            const rateLimiter1 = await rateLimiterService.getRateLimiter('test');
            const rateLimiter2 = await rateLimiterService.getRateLimiter('test1');
            expect(rateLimiter1).not.toBe(rateLimiter2);
        });
    });

    describe('executeRateLimiter', () => {
        let executionContext: ExecutionContext;
        let reflector: Reflector;
        let rateLimiterService: RateLimiterService;

        beforeEach(() => {
            executionContext = fakeExecutionContext() as any;
            reflector = new Reflector();
            reflector.get = jest.fn(() => ({})) as any;
            rateLimiterService = new RateLimiterService(defaultRateLimiterOptions, reflector);
            rateLimiterService.getRateLimiter = jest.fn(() => ({
                consume: jest.fn,
            })) as any;
        });

        it('should overwrite root options with reflected options', async () => {
            const mockOptions = { points: 10, pointsConsumed: 4, keyPrefix: 'testing' };
            reflector.get = jest.fn(() => mockOptions) as any;
            await rateLimiterService.executeRateLimiter(executionContext);
            expect(rateLimiterService.getRateLimiter).toBeCalledWith(mockOptions.keyPrefix, mockOptions);
        });

        it('should generate key automatically if not provided in reflected options', async () => {
            const mockOptions = { points: 10, pointsConsumed: 4 };
            reflector.get = jest.fn(() => mockOptions) as any;
            await rateLimiterService.executeRateLimiter(executionContext);
            expect(rateLimiterService.getRateLimiter).toBeCalledWith(
                `${executionContext.getClass().name}-${executionContext.getHandler().name}`,
                mockOptions,
            );
        });

        it('should use response.set if defined (Express - default)', async () => {
            executionContext = fakeExecutionContext(undefined, { set: jest.fn(), header: jest.fn() }) as any;
            await rateLimiterService.executeRateLimiter(executionContext);
            expect(executionContext.switchToHttp().getResponse().set).toHaveBeenCalled();
            expect(executionContext.switchToHttp().getResponse().header).not.toHaveBeenCalled();
        });

        it('should use response.header if defined and response.set is not (Fastify)', async () => {
            executionContext = fakeExecutionContext(undefined, { header: jest.fn() }) as any;
            await rateLimiterService.executeRateLimiter(executionContext);
            expect(executionContext.switchToHttp().getResponse().header).toHaveBeenCalled();
        });

        it('should throw an error if header set method cannot be determined', async () => {
            let error: Error;
            try {
                executionContext = fakeExecutionContext(undefined, {}) as any;
                await rateLimiterService.executeRateLimiter(executionContext);
            } catch (e) {
                error = e;
            }
            expect(error).toBeTruthy();
        });

        it('should use request.user.id as key if defined', async () => {
            executionContext = fakeExecutionContext({ user: { id: 'userId' } }) as any;
            const consumeMock = jest.fn(() => ({ msBeforeNext: 1000 }));
            rateLimiterService.getRateLimiter = jest.fn(() => ({
                consume: consumeMock,
            })) as any;
            await rateLimiterService.executeRateLimiter(executionContext);
            expect(consumeMock).toHaveBeenCalledWith('userId', expect.anything());
        });

        it('should use ip as key if request.user.id is not defined', async () => {
            const consumeMock = jest.fn(() => ({ msBeforeNext: 1000 }));
            rateLimiterService.getRateLimiter = jest.fn(() => ({
                consume: consumeMock,
            })) as any;
            await rateLimiterService.executeRateLimiter(executionContext);
            expect(consumeMock).toHaveBeenCalledWith(
                executionContext.switchToHttp().getRequest().ip,
                expect.anything(),
            );
        });

        it('should use keyGenerator option to generate key if specified', async () => {
            const mockOptions = {
                keyGenerator: (request: any) => request.accountId,
            };
            reflector.get = jest.fn(() => mockOptions) as any;
            executionContext = fakeExecutionContext({ accountId: 'account-id' }) as any;
            const consumeMock = jest.fn(() => ({ msBeforeNext: 1000 }));
            rateLimiterService.getRateLimiter = jest.fn(() => ({
                consume: consumeMock,
            })) as any;
            await rateLimiterService.executeRateLimiter(executionContext);
            expect(consumeMock).toHaveBeenCalledWith('account-id', expect.anything());
        });

        it('should set headers', async () => {
            executionContext = fakeExecutionContext(undefined, { header: jest.fn() }) as any;
            await rateLimiterService.executeRateLimiter(executionContext);
            expect(executionContext.switchToHttp().getResponse().header).toHaveBeenCalledTimes(4);
            expect(executionContext.switchToHttp().getResponse().header).toHaveBeenCalledWith(
                'Retry-After',
                expect.anything(),
            );
            expect(executionContext.switchToHttp().getResponse().header).toHaveBeenCalledWith(
                'X-RateLimit-Limit',
                expect.anything(),
            );
            expect(executionContext.switchToHttp().getResponse().header).toHaveBeenCalledWith(
                'X-Retry-Remaining',
                undefined,
            );
            expect(executionContext.switchToHttp().getResponse().header).toHaveBeenCalledWith(
                'X-Retry-Reset',
                expect.anything(),
            );
        });

        it('should not set headers if headers option is false', async () => {
            const mockOptions = { headers: false };
            reflector.get = jest.fn(() => mockOptions) as any;
            executionContext = fakeExecutionContext(undefined, { header: jest.fn() }) as any;
            await rateLimiterService.executeRateLimiter(executionContext);
            expect(executionContext.switchToHttp().getResponse().header).not.toHaveBeenCalled();
        });

        it('should throw TooManyRequests exception if rate limit exceeded', async () => {
            let error;
            try {
                executionContext = fakeExecutionContext(undefined, { header: jest.fn() }) as any;
                rateLimiterService.getRateLimiter = jest.fn(() => ({
                    consume: () => Promise.reject({ msBeforeNext: 1000 }),
                })) as any;
                await rateLimiterService.executeRateLimiter(executionContext);
            } catch (e) {
                error = e;
            }
            expect(error).toBeInstanceOf(HttpException);
            expect((error as HttpException).getStatus()).toEqual(429);
        });

        it('should rethrow any errors', async () => {
            let error;
            try {
                executionContext = fakeExecutionContext(undefined, { header: jest.fn() }) as any;
                rateLimiterService.getRateLimiter = jest.fn(() => ({
                    consume: () => {
                        throw new Error();
                    },
                })) as any;
                await rateLimiterService.executeRateLimiter(executionContext);
            } catch (e) {
                error = e;
            }
            expect(error).toBeInstanceOf(Error);
        });
    });
});
