import { describe, expect, it } from "vitest";

import {
  DAILY_CHINESE_LOCALIZATION_CUTOVER_DATE,
  assertDailyLocalization,
  dailyLocalizationFailures,
} from "../../scripts/daily-localization-contract.mjs";

function report(date, items) {
  return { date, items };
}

describe("daily Chinese localization release contract", () => {
  it("does not retroactively reject reports before the localization cutover", () => {
    expect(
      dailyLocalizationFailures(
        report("2026-07-28", [
          {
            id: "legacy",
            content_type: "news",
            title: "English title",
            summary: "English summary",
          },
        ]),
      ),
    ).toEqual([]);
  });

  it("requires Chinese titles and summaries from the cutover date", () => {
    expect(
      dailyLocalizationFailures(
        report(DAILY_CHINESE_LOCALIZATION_CUTOVER_DATE, [
          {
            id: "social",
            content_type: "socialMedia",
            title: "English title",
            summary: "English summary",
          },
        ]),
      ),
    ).toEqual([
      {
        date: DAILY_CHINESE_LOCALIZATION_CUTOVER_DATE,
        item_id: "social",
        field: "summary",
      },
      {
        date: DAILY_CHINESE_LOCALIZATION_CUTOVER_DATE,
        item_id: "social",
        field: "title",
      },
    ]);
  });

  it("allows a project name to remain untranslated when its summary is Chinese", () => {
    expect(() =>
      assertDailyLocalization(
        report(DAILY_CHINESE_LOCALIZATION_CUTOVER_DATE, [
          {
            id: "project",
            content_type: "project",
            title: "free-stockdb",
            summary: "这是一个本地量化数据项目。",
          },
          {
            id: "social",
            content_type: "socialMedia",
            title: "MCP 新版采用无状态架构",
            summary: "新版协议更容易部署和扩展。",
          },
        ]),
      ),
    ).not.toThrow();
  });

  it("fails closed when a translated title still has an English-only summary", () => {
    expect(() =>
      assertDailyLocalization(
        report(DAILY_CHINESE_LOCALIZATION_CUTOVER_DATE, [
          {
            id: "partial",
            content_type: "news",
            title: "标题已经翻译",
            summary: "Summary was not translated",
          },
        ]),
      ),
    ).toThrow(
      "Chinese localization is incomplete for 2026-07-29: partial.summary",
    );
  });
});
