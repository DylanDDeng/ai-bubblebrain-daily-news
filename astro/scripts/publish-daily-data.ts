import { resolve } from 'node:path';

import { publishDailyData } from '../src/lib/publishDailyData';

const astroRoot = process.cwd();
const names = await publishDailyData({
	sourceDirectory: resolve(astroRoot, '..', 'data', 'daily'),
	outputDirectory: resolve(astroRoot, 'dist', 'data', 'daily'),
});

console.log(`Published ${names.length} canonical structured daily JSON file(s).`);
