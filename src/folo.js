import { getFromKV, storeInKV } from './kv.js';

const DEFAULT_FOLO_DATA_API = 'https://api.folo.is/entries';
const LEGACY_FOLO_COOKIE_KV_KEY = 'folo:cookie';
const FOLO_COOKIE_KV_TTL = 86400 * 60; // 60 days

function getFoloCookieKvKey(env) {
    return String(env.FOLO_COOKIE_KV_KEY || LEGACY_FOLO_COOKIE_KV_KEY).trim() || LEGACY_FOLO_COOKIE_KV_KEY;
}

export function getFoloDataApi(env) {
    const configuredApi = String(env.FOLO_DATA_API || DEFAULT_FOLO_DATA_API).trim() || DEFAULT_FOLO_DATA_API;

    try {
        const url = new URL(configuredApi);
        if (url.hostname === 'api.follow.is') {
            url.hostname = 'api.folo.is';
        }
        return url.toString();
    } catch {
        return configuredApi.replace('api.follow.is', 'api.folo.is');
    }
}

function normalizeCookieString(raw) {
    let cookie = String(raw || '').trim();
    if (
        (cookie.startsWith('"') && cookie.endsWith('"')) ||
        (cookie.startsWith("'") && cookie.endsWith("'"))
    ) {
        cookie = cookie.slice(1, -1).trim();
    }
    return cookie || null;
}

// 同步版本：仅从 env var 读取（保持向后兼容，用于不需要 KV 的路径）
export function getFoloCookie(env, requestCookie) {
    return normalizeCookieString(requestCookie || env.FOLO_COOKIE || '');
}

// 从 KV 读取 Cookie：优先使用配置的 key，兼容旧 key
async function getFoloCookieFromKV(env) {
    const keys = Array.from(new Set([getFoloCookieKvKey(env), LEGACY_FOLO_COOKIE_KV_KEY]));

    for (const key of keys) {
        try {
            const kvCookie = await getFromKV(env.DATA_KV, key);
            const normalized = normalizeCookieString(kvCookie);
            if (normalized) {
                console.log(`[Folo] 从 KV 读取 Cookie 成功: ${key}`);
                return normalized;
            }
        } catch (e) {
            console.warn(`[Folo] 从 KV 读取 Cookie 失败 (${key}):`, e.message);
        }
    }

    return null;
}

// 将 Cookie 写入 KV
export async function storeFoloCookieToKV(env, cookie) {
    const normalized = normalizeCookieString(cookie);
    if (!normalized) return false;
    try {
        const key = getFoloCookieKvKey(env);
        await storeInKV(env.DATA_KV, key, normalized, FOLO_COOKIE_KV_TTL);
        console.log(`[Folo] Cookie 已写入 KV: ${key}`);
        return true;
    } catch (e) {
        console.error('[Folo] 写入 KV 失败:', e.message);
        return false;
    }
}

// 异步获取 Cookie：KV 优先 → 环境变量兜底
export async function resolveFoloCookie(env, requestCookie) {
    // 请求体传入的 cookie 优先级最高
    if (requestCookie) {
        const normalized = normalizeCookieString(requestCookie);
        if (normalized) return normalized;
    }
    // 其次从 KV 读取
    const kvCookie = await getFoloCookieFromKV(env);
    if (kvCookie) return kvCookie;
    // 最后 fallback 到环境变量
    return getFoloCookie(env);
}

// 获取 Folo 会话接口 URL
export function getFoloSessionApi(env) {
    return String(env.FOLO_SESSION_API || 'https://api.folo.is/auth/session').trim();
}

// 从 Set-Cookie 响应头中提取新的 __Secure-better-auth.session_token，
// 并替换原 cookie 字符串中的对应 token
function extractRefreshedCookie(setCookieHeader, originalCookie) {
    if (!setCookieHeader || !originalCookie) return null;
    const match = setCookieHeader.match(/__Secure-better-auth\.session_token=([^;]+)/);
    if (!match) return null;
    const newToken = decodeURIComponent(match[1]);
    return originalCookie.replace(
        /__Secure-better-auth\.session_token=[^;]+/,
        `__Secure-better-auth.session_token=${newToken}`
    );
}

// 尝试通过 Folo get-session 接口刷新 Cookie 有效期
// 成功时返回新的 cookie 字符串并写入 KV，失败时返回 null
export async function tryRefreshFoloSession(env) {
    const currentCookie = await resolveFoloCookie(env);
    if (!currentCookie) {
        console.warn('[Folo] 无可用 Cookie，跳过会话刷新。');
        return null;
    }

    try {
        const sessionApi = getFoloSessionApi(env);
        console.log(`[Folo] 正在刷新会话: ${sessionApi}`);

        const response = await fetch(sessionApi, {
            method: 'GET',
            headers: {
                'Cookie': currentCookie,
                'User-Agent': 'Cloudflare-Worker/1.0',
                'Accept': 'application/json',
                'Origin': 'https://app.folo.is',
                'Referer': 'https://app.folo.is/',
            }
        });

        if (!response.ok) {
            console.error(`[Folo] 会话刷新失败: ${response.status} ${response.statusText}`);
            return null;
        }

        // 检查服务端是否返回了新的 Set-Cookie
        const setCookieHeader = response.headers.get('Set-Cookie');
        if (setCookieHeader) {
            const newCookie = extractRefreshedCookie(setCookieHeader, currentCookie);
            if (newCookie) {
                await storeFoloCookieToKV(env, newCookie);
                console.log('[Folo] Cookie 已刷新并写入 KV。');
                return newCookie;
            }
        }

        // 没有新 Cookie 但会话仍有效，将当前 Cookie 写入 KV
        await storeFoloCookieToKV(env, currentCookie);
        console.log('[Folo] 会话有效，无需刷新。');
        return currentCookie;
    } catch (error) {
        console.error('[Folo] 会话刷新异常:', error.message);
        return null;
    }
}

export async function debugFoloCookie(env) {
    const cookie = await resolveFoloCookie(env);
    const result = {
        hasCookie: Boolean(cookie),
        cookieLength: cookie ? cookie.length : 0,
        probeStatus: null,
        probeOk: false,
        probeItemCount: 0,
        error: null,
    };

    if (!cookie) return result;

    try {
        const response = await fetch(getFoloDataApi(env), {
            method: 'POST',
            headers: {
                'Cookie': cookie,
                'User-Agent': 'Cloudflare-Worker/1.0',
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Origin': 'https://app.folo.is',
                'Referer': 'https://app.folo.is/',
                'x-app-name': 'Folo Web',
                'x-app-version': '0.4.9',
            },
            body: JSON.stringify({
                feedId: env.AIBASE_FEED_ID,
                view: 1,
                withContent: true,
            }),
        });

        result.probeStatus = response.status;
        result.probeOk = response.ok;

        const data = await response.json().catch(() => null);
        result.probeItemCount = Array.isArray(data?.data) ? data.data.length : 0;
        if (!response.ok) {
            result.error = data?.message || data?.error || response.statusText;
        }
    } catch (error) {
        result.error = error.message;
    }

    return result;
}

export async function getFoloErrorMessage(response) {
    let responseText = '';
    try {
        responseText = await response.text();
    } catch {
        responseText = '';
    }

    const detail = responseText ? ` - ${responseText.slice(0, 500)}` : '';
    return `${response.status} ${response.statusText}${detail}`;
}
