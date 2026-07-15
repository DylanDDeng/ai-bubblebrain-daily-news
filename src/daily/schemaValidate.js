import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import schema from '../../schemas/daily-report.schema.json' with { type: 'json' };

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

export function validateDailyReportSchema(report) {
    if (!validateSchema(report)) {
        const details = (validateSchema.errors || [])
            .map(error => `${error.instancePath || '/'} ${error.message}`)
            .join('; ');
        throw new Error(`Invalid daily report schema: ${details}`);
    }
    return true;
}
