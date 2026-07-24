export class AdminRequestError extends Error {
    constructor(status, message) {
        super(message);
        this.name = 'AdminRequestError';
        this.status = status;
    }
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const BATCHES = new Set(['morning', 'afternoon', 'night', 'lateNight']);

function isValidDate(value) {
    if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year
        && parsed.getUTCMonth() === month - 1
        && parsed.getUTCDate() === day;
}

async function readLimitedBody(request, maxBytes) {
    const contentLength = request.headers.get('Content-Length');
    if (contentLength !== null) {
        const declaredLength = Number(contentLength);
        if (!Number.isFinite(declaredLength) || declaredLength < 0) {
            throw new AdminRequestError(400, 'Invalid Content-Length');
        }
        if (declaredLength > maxBytes) {
            throw new AdminRequestError(413, 'Request body too large');
        }
    }

    if (!request.body) throw new AdminRequestError(400, 'JSON body required');

    const reader = request.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let byteLength = 0;
    let text = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            byteLength += value.byteLength;
            if (byteLength > maxBytes) {
                await reader.cancel();
                throw new AdminRequestError(413, 'Request body too large');
            }
            text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
    } catch (error) {
        if (error instanceof AdminRequestError) throw error;
        throw new AdminRequestError(400, 'Malformed request body');
    }

    return text;
}

function assertExactFields(body, allowedFields) {
    const extraFields = Object.keys(body).filter(field => !allowedFields.includes(field));
    if (extraFields.length > 0) {
        throw new AdminRequestError(400, 'Unexpected JSON fields');
    }
}

function validateDate(value, required = false) {
    if (value === undefined && !required) return;
    if (!isValidDate(value)) throw new AdminRequestError(400, 'Invalid date');
}

function validateBody(route, body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new AdminRequestError(400, 'JSON object required');
    }

    if (route === '/auto') {
        assertExactFields(body, ['date']);
        validateDate(body.date);
        return { date: body.date };
    }

    if (route === '/incrementalDaily') {
        assertExactFields(body, ['date', 'batch']);
        validateDate(body.date);
        if (body.batch !== undefined && !BATCHES.has(body.batch)) {
            throw new AdminRequestError(400, 'Invalid batch');
        }
        return { date: body.date, batch: body.batch };
    }

    if (route === '/reconcileDaily') {
        assertExactFields(body, ['scheduled_at']);
        const scheduledAt = body.scheduled_at;
        const parsed = typeof scheduledAt === 'string' ? new Date(scheduledAt) : null;
        if (
            typeof scheduledAt !== 'string' ||
            !/^\d{4}-\d{2}-\d{2}T\d{2}:00:00\.000Z$/.test(scheduledAt) ||
            Number.isNaN(parsed.getTime()) ||
            parsed.toISOString() !== scheduledAt ||
            !new Set([0, 2, 4, 6, 8, 10, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23])
                .has(parsed.getUTCHours())
        ) {
            throw new AdminRequestError(400, 'Invalid scheduled_at');
        }
        return { scheduled_at: body.scheduled_at };
    }

    if (route === '/writeRssData') {
        assertExactFields(body, ['date']);
        validateDate(body.date, true);
        return { date: body.date };
    }

    if (route === '/updateFoloCookie') {
        assertExactFields(body, ['cookie']);
        if (
            typeof body.cookie !== 'string'
            || !body.cookie.trim()
            || body.cookie.length > 16384
            || /[\u0000-\u001f\u007f]/.test(body.cookie)
        ) {
            throw new AdminRequestError(400, 'Invalid cookie');
        }
        return { cookie: body.cookie };
    }

    if (route === '/debugFoloCookie') {
        assertExactFields(body, []);
        return {};
    }

    throw new AdminRequestError(404, 'Not found');
}

export async function parseAdminJsonRequest(request, route) {
    const mediaType = (request.headers.get('Content-Type') || '').split(';', 1)[0].trim().toLowerCase();
    if (mediaType !== 'application/json') {
        throw new AdminRequestError(415, 'Content-Type must be application/json');
    }

    const maxBytes = route === '/updateFoloCookie' ? 70 * 1024 : 4 * 1024;
    const rawBody = await readLimitedBody(request, maxBytes);
    let body;
    try {
        body = JSON.parse(rawBody);
    } catch {
        throw new AdminRequestError(400, 'Malformed JSON');
    }

    return validateBody(route, body);
}
