import { describe, expect, it, vi } from 'vitest';
import { handleLogin, handleLogout, sanitizeRedirect } from '../../src/auth.js';

function env(overrides = {}) {
    return {
        LOGIN_USERNAME_SECRET: 'admin',
        LOGIN_PASSWORD_SECRET: 'correct-password',
        DATA_KV: {
            put: vi.fn(async () => undefined),
            get: vi.fn(async () => null),
            delete: vi.fn(async () => undefined),
        },
        LOGIN_RATE_LIMITER: {
            limit: vi.fn(async () => ({ success: true })),
        },
        ...overrides,
    };
}

function loginPost(redirect, overrides = {}) {
    const body = new URLSearchParams({
        username: 'admin',
        password: 'correct-password',
        redirect,
    });
    return new Request('https://worker.example/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'CF-Connecting-IP': '192.0.2.10',
        },
        body,
        ...overrides,
    });
}

describe('session login boundary', () => {
    it.each([
        ['https://attacker.example', '/getContentHtml'],
        ['//attacker.example/path', '/getContentHtml'],
        ['/\\attacker.example/path', '/getContentHtml'],
        ['javascript:alert(1)', '/getContentHtml'],
        ['/safe/path?tab=one#section', '/safe/path?tab=one#section'],
    ])('sanitizes redirect %s', (input, expected) => {
        expect(sanitizeRedirect(input)).toBe(expected);
    });

    it('does not reflect executable markup from the login query', async () => {
        const payload = '/"><script>globalThis.pwned=true</script>';
        const request = new Request(`https://worker.example/login?redirect=${encodeURIComponent(payload)}`);
        const response = await handleLogin(request, env());
        const html = await response.text();

        expect(response.status).toBe(200);
        expect(html).not.toContain('<script>globalThis.pwned=true</script>');
        expect(html).not.toContain('value="/"><script>');
    });

    it('never returns an external post-login redirect', async () => {
        const response = await handleLogin(loginPost('https://attacker.example'), env());

        expect(response.status).toBe(200);
        expect(response.headers.get('X-Redirect-Url')).toBe('/');
    });

    it('uses the distributed login rate limiter before validating credentials', async () => {
        const testEnv = env({
            LOGIN_RATE_LIMITER: {
                limit: vi.fn(async () => ({ success: false })),
            },
        });
        const response = await handleLogin(loginPost('/getContentHtml'), testEnv);

        expect(response.status).toBe(429);
        expect(response.headers.get('Retry-After')).toBe('60');
        expect(testEnv.DATA_KV.put).not.toHaveBeenCalled();
    });

    it('fails closed when the login rate limiter is unavailable', async () => {
        const response = await handleLogin(loginPost('/getContentHtml'), env({
            LOGIN_RATE_LIMITER: undefined,
        }));
        expect(response.status).toBe(503);
    });

    it('prevents open redirects on logout', async () => {
        const response = await handleLogout(
            new Request('https://worker.example/logout?redirect=https%3A%2F%2Fattacker.example'),
            env(),
        );
        expect(response.status).toBe(302);
        expect(response.headers.get('Location')).toBe('/login');
    });
});
