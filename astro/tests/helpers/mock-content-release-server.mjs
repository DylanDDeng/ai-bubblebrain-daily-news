/* global Buffer, console, process */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';

const port = Number(process.env.MOCK_CONTENT_PORT || '43177');
const releaseId = '11111111-1111-4111-8111-111111111111';
const reportDates = ['2026-07-16', '2026-07-17'];
const reports = new Map();
for (const reportDate of reportDates) {
	const bytes = await readFile(resolve(process.cwd(), '..', 'data', 'daily', `${reportDate}.json`));
	reports.set(reportDate, {
		bytes,
		hash: createHash('sha256').update(bytes).digest('hex'),
	});
}
const manifest = Buffer.from(
	`${JSON.stringify(
		{
			schema_version: 1,
			taxonomy_version: 1,
			site_release_id: releaseId,
			site_release_sequence: 7,
			expected_predecessor_id: null,
			structured_cutover_date: '2026-07-16',
			source_contract_version: 'daily-source-v1',
			serializer_version: 'daily-json-c14n-v1',
			search_contract_version: 'search-v1',
			content_root_sha256: 'c'.repeat(64),
			no_report_days: [],
			reports: reportDates.map((reportDate) => ({
				report_date: reportDate,
				report_snapshot_id:
					reportDate === '2026-07-16'
						? '22222222-2222-4222-8222-222222222222'
						: '33333333-3333-4333-8333-333333333333',
				byte_sha256: reports.get(reportDate).hash,
			})),
		},
		null,
		2,
	)}\n`,
);
const manifestHash = createHash('sha256').update(manifest).digest('hex');

createServer((request, response) => {
	if (request.url === `/internal/build/releases/${releaseId}/manifest`) {
		response.writeHead(200, {
			'Content-Type': 'application/json',
			ETag: `"sha256-${manifestHash}"`,
		});
		response.end(manifest);
		return;
	}
	const match = request.url?.match(
		new RegExp(`^/internal/build/releases/${releaseId}/reports/(\\d{4}-\\d{2}-\\d{2})$`),
	);
	const report = match ? reports.get(match[1]) : null;
	if (report) {
		response.writeHead(200, { 'Content-Type': 'application/json' });
		response.end(report.bytes);
		return;
	}
	response.writeHead(404).end();
}).listen(port, '127.0.0.1', () => {
	console.log(`mock-content-release-ready:${port}:${releaseId}`);
});
