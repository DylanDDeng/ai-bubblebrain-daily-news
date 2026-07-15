export function createRequestId(request) {
    return request.headers.get('cf-ray') || crypto.randomUUID();
}

export function logAdminError({ requestId, route, error }) {
    console.error('[AdminRoute] request failed', {
        requestId,
        route,
        errorType: error?.name || 'Error',
    });
}

export function logMissingConfig(missingVars) {
    console.error('[RuntimeConfig] missing required bindings', {
        missing: missingVars,
    });
}
