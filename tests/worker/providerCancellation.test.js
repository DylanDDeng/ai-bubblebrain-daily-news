import { afterEach, describe, expect, it, vi } from 'vitest';
import { callChatAPI } from '../../src/chatapi.js';
import { sleep } from '../../src/helpers.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('provider attempt cancellation', () => {
    it('propagates the provider signal into a non-streaming chat request', async () => {
        let requestSignal;
        vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
            requestSignal = options.signal;
            return await new Promise((_, reject) => {
                requestSignal.addEventListener('abort', () => reject(requestSignal.reason), {
                    once: true,
                });
            });
        }));
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const controller = new AbortController();
        const request = callChatAPI({
            USE_MODEL_PLATFORM: 'OPEN',
            OPENAI_API_URL: 'https://chat.example.test',
            OPENAI_API_KEY: 'test-key',
            DEFAULT_OPEN_MODEL: 'test-model',
        }, 'prompt', null, { signal: controller.signal });

        await vi.waitFor(() => expect(requestSignal).toBeInstanceOf(AbortSignal));
        controller.abort();

        await expect(request).rejects.toMatchObject({ name: 'AbortError' });
        expect(requestSignal.aborted).toBe(true);
    });

    it('cancels a pagination delay without leaving its timer alive', async () => {
        const controller = new AbortController();
        const delay = sleep(60_000, { signal: controller.signal });

        controller.abort();

        await expect(delay).rejects.toMatchObject({ name: 'AbortError' });
    });
});
