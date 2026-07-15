import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import dailyReportSchema from '../../../schemas/daily-report.schema.json';

let validatorPromise: Promise<ValidateFunction> | null = null;

async function createValidator(): Promise<ValidateFunction> {
	const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
	addFormats(ajv);
	return ajv.compile(dailyReportSchema);
}

export async function validateDailyReportSchemaForAstro(report: unknown): Promise<void> {
	validatorPromise ??= createValidator();
	const validate = await validatorPromise;
	if (validate(report)) return;
	const details = (validate.errors ?? [])
		.map((error) => `${error.instancePath || '/'} ${error.message}`)
		.join('; ');
	throw new Error(`Invalid daily report schema: ${details}`);
}
