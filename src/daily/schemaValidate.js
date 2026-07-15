import validateSchema from './generated/dailyReportValidator.js';

export function validateDailyReportSchema(report) {
    if (!validateSchema(report)) {
        const details = (validateSchema.errors || [])
            .map(error => `${error.instancePath || '/'} ${error.message}`)
            .join('; ');
        throw new Error(`Invalid daily report schema: ${details}`);
    }
    return true;
}
