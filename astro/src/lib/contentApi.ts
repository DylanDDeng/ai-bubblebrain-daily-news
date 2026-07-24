const CONTENT_API_ORIGIN =
	import.meta.env.CONTENT_API_ORIGIN || 'https://content-api.bubblenews.today';

interface CurrentRelease {
	site_release_id: string;
	site_release_sequence: number;
	generation: number;
}

interface ManifestReportEntry {
	report_date: string;
	report_snapshot_id: string;
	byte_sha256: string;
}

let cachedRelease: { data: CurrentRelease; expiresAt: number } | null = null;
const RELEASE_CACHE_MS = 60_000;

export async function fetchCurrentRelease(): Promise<CurrentRelease | null> {
	const now = Date.now();
	if (cachedRelease && cachedRelease.expiresAt > now) {
		return cachedRelease.data;
	}
	try {
		const res = await fetch(`${CONTENT_API_ORIGIN}/v1/current`, {
			headers: { Accept: 'application/json' },
		});
		if (!res.ok) return null;
		const data = (await res.json()) as CurrentRelease;
		cachedRelease = { data, expiresAt: now + RELEASE_CACHE_MS };
		return data;
	} catch {
		return cachedRelease?.data ?? null;
	}
}

async function fetchManifestReports(releaseId: string): Promise<ManifestReportEntry[]> {
	try {
		const res = await fetch(`${CONTENT_API_ORIGIN}/v1/releases/${releaseId}/manifest`, {
			headers: { Accept: 'application/json' },
		});
		if (!res.ok) return [];
		const data = (await res.json()) as { reports?: ManifestReportEntry[] };
		return Array.isArray(data.reports) ? data.reports : [];
	} catch {
		return [];
	}
}

export async function fetchDailyReport(
	dateKey: string,
): Promise<Record<string, unknown> | null> {
	const release = await fetchCurrentRelease();
	if (!release) return null;
	try {
		const res = await fetch(
			`${CONTENT_API_ORIGIN}/v1/releases/${release.site_release_id}/reports/${dateKey}`,
			{ headers: { Accept: 'application/json' } },
		);
		if (!res.ok) return null;
		const data = (await res.json()) as { document?: Record<string, unknown> };
		return data.document ?? null;
	} catch {
		return null;
	}
}

export async function fetchLatestReport(): Promise<{
	dateKey: string;
	report: Record<string, unknown>;
} | null> {
	const release = await fetchCurrentRelease();
	if (!release) return null;
	const reports = await fetchManifestReports(release.site_release_id);
	if (reports.length === 0) return null;
	const latestDate = reports
		.map((entry) => entry.report_date)
		.sort()
		.at(-1);
	if (!latestDate) return null;
	const report = await fetchDailyReport(latestDate);
	return report ? { dateKey: latestDate, report } : null;
}
