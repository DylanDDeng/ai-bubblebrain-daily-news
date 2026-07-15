import { describe, expect, it } from "vitest";

import {
  itemMatchesTimelineState,
  parseTimelineState,
  timelineSearchForState,
} from "../../static/js/daily-timeline.js";

describe("daily timeline URL state", () => {
  it("parses valid shareable filters and rejects unknown types", () => {
    expect(parseTimelineState("?type=paper&q=%20Agent%20")).toEqual({
      type: "paper",
      query: "Agent",
    });
    expect(parseTimelineState("?type=unknown")).toEqual({
      type: "all",
      query: "",
    });
  });

  it("preserves unrelated parameters and removes default timeline state", () => {
    expect(
      timelineSearchForState("?ref=home&type=news&q=AI", {
        type: "paper",
        query: "模型",
      }),
    ).toBe("?ref=home&type=paper&q=%E6%A8%A1%E5%9E%8B");
    expect(
      timelineSearchForState("?ref=home&type=news&q=AI", {
        type: "all",
        query: "",
      }),
    ).toBe("?ref=home");
  });

  it("matches both content type and case-insensitive search text", () => {
    const item = {
      dataset: {
        contentType: "paper",
        search: "example source agent research",
      },
    };
    expect(
      itemMatchesTimelineState(item, { type: "paper", query: "AGENT" }),
    ).toBe(true);
    expect(
      itemMatchesTimelineState(item, { type: "news", query: "agent" }),
    ).toBe(false);
    expect(
      itemMatchesTimelineState(item, { type: "all", query: "missing" }),
    ).toBe(false);
  });
});
