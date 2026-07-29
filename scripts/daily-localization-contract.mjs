export const DAILY_CHINESE_LOCALIZATION_CUTOVER_DATE = "2026-07-29";

const HAN_TEXT = /[\u3400-\u9fff\uf900-\ufaff]/u;

function hasChineseText(value) {
  return typeof value === "string" && HAN_TEXT.test(value);
}

export function dailyLocalizationFailures(report) {
  if (
    !report ||
    typeof report !== "object" ||
    typeof report.date !== "string" ||
    report.date < DAILY_CHINESE_LOCALIZATION_CUTOVER_DATE
  ) {
    return [];
  }

  const failures = [];
  for (const item of Array.isArray(report.items) ? report.items : []) {
    const identity = String(item?.id || "unknown");
    if (!hasChineseText(item?.summary)) {
      failures.push({
        date: report.date,
        item_id: identity,
        field: "summary",
      });
    }
    if (
      item?.content_type !== "project" &&
      !hasChineseText(item?.title)
    ) {
      failures.push({
        date: report.date,
        item_id: identity,
        field: "title",
      });
    }
  }
  return failures;
}

export function assertDailyLocalization(report) {
  const failures = dailyLocalizationFailures(report);
  if (!failures.length) return;
  const preview = failures
    .slice(0, 10)
    .map((failure) => `${failure.item_id}.${failure.field}`)
    .join(", ");
  const suffix =
    failures.length > 10 ? ` and ${failures.length - 10} more` : "";
  throw new Error(
    `Chinese localization is incomplete for ${report.date}: ${preview}${suffix}`,
  );
}
