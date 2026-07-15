import { describe, expect, it } from "vitest";

import { normalizeSourceItem } from "../../src/daily/normalize.js";
import { sanitizeSummaryText } from "../../src/daily/summary.js";
import { extractSummaryText } from "../../src/helpers.js";

describe("timeline summary sanitization", () => {
  it.each([
    ["前文 https://example.com/a。后文", "前文。后文"],
    ["前文 https://example.com/a，后文", "前文，后文"],
    ["前文 [图片: https://proxy.example/a?x=1&y=2] 后文", "前文 后文"],
    ["前文 \\[图片: https://proxy.example/a] 后文", "前文 后文"],
    ["前文 [图片: openai https://pic.chinaz……", "前文"],
    ["前文 [image: https://proxy.example/truncated…", "前文"],
    ["前文 [图片: [P] 预览 [P] https://proxy.example/a] 后文", "前文 后文"],
    ["前文 [视频: https://video.example/a.mp4] 后文", "前文 后文"],
    ["前文 [video: [P] https://video.example/a.mp4] 后文", "前文 后文"],
    [
      "前文 [图片: https://proxy.example/a] 中段 [视频: https://video.example/a.mp4] 后文",
      "前文 中段 后文",
    ],
    ["前文 [原文](https://example.com/a?q=1) 后文", "前文 原文 后文"],
    [
      "前文 ([ https://example.com/story\\](https://example.com/story) ) 后文",
      "前文 后文",
    ],
    ["前文 ![图](https://example.com/a.png) 后文", "前文 后文"],
    ["前文 https://example.com/a_(b) 后文", "前文 后文"],
    [
      "context (see [https://a.example](https://b.example)) after",
      "context (see ) after",
    ],
    ["调用 foo() 返回 []", "调用 foo() 返回 []"],
  ])("cleans display-only URL payloads from %s", (input, expected) => {
    expect(sanitizeSummaryText(input)).toBe(expected);
  });

  it.each([
    ["前文 [图片: openai https://pic.chinaz……", "前文"],
    ["前文 [图片: https://proxy.example/a] 后文", "前文 后文"],
    ["前文 [视频: [P] https://video.example/a.mp4] 后文", "前文 后文"],
    ["前文 https://example.com/a 后文", "前文 后文"],
  ])("cleans legacy summary excerpts before truncation", (input, expected) => {
    expect(extractSummaryText(input, 220)).toBe(expected);
  });

  it("sanitizes future report summaries without changing source identity fields", async () => {
    const result = await normalizeSourceItem(
      {
        id: "source-1",
        title: "测试标题",
        url: "https://example.com/story?utm_source=test",
        summary:
          "摘要 [图片: https://proxy.example/very-long] https://example.com/raw。保留正文",
        source: { name: "测试来源" },
        published_at: "2026-07-14T06:20:00Z",
      },
      {
        provider: "aibase",
        batch: "afternoon",
        runAt: "2026-07-14T07:00:00Z",
      },
    );

    expect(result.accepted).toBe(true);
    expect(result.item.canonical_url).toBe("https://example.com/story");
    expect(result.item.summary).toBe("摘要。保留正文");
  });
});
