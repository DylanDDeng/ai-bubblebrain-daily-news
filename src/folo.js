const DEFAULT_FOLO_DATA_API = 'https://api.folo.is/entries';

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

export function getFoloCookie(env, requestCookie) {
    let cookie = requestCookie || env.FOLO_COOKIE || '';
    cookie = String(cookie).trim();

    if (
        (cookie.startsWith('"') && cookie.endsWith('"')) ||
        (cookie.startsWith("'") && cookie.endsWith("'"))
    ) {
        cookie = cookie.slice(1, -1).trim();
    }

    return cookie || null;
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
