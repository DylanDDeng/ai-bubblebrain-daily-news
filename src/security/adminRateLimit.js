export async function checkAdminRateLimit(request, env, route) {
    if (!env.ADMIN_RATE_LIMITER || typeof env.ADMIN_RATE_LIMITER.limit !== 'function') {
        return { allowed: false, unavailable: true, retryAfter: 0 };
    }

    const client = request.headers.get('CF-Connecting-IP') || 'unknown';
    try {
        const result = await env.ADMIN_RATE_LIMITER.limit({ key: `${client}:${route}` });
        return {
            allowed: result.success === true,
            unavailable: false,
            retryAfter: result.success === true ? 0 : 60,
        };
    } catch {
        return { allowed: false, unavailable: true, retryAfter: 0 };
    }
}
