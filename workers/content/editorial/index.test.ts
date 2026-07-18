import { describe, expect, it } from "vitest";
import { applyDraft, applyGlobalSuppression } from "./index";

describe("report-scoped hide materialization", () => {
  it("removes an item only from the named report without creating a global override", () => {
    const hidden = `n_${"a".repeat(64)}`;
    const retained = `n_${"b".repeat(64)}`;
    const target: Record<string, unknown> = {
      date: "2026-07-17",
      overview: { text: "mentions hidden" },
      items: [
        { id: hidden, related_source_ids: [] },
        { id: retained, related_source_ids: [hidden] },
      ],
      batches: [{ item_ids: [hidden, retained] }],
    };
    const other = structuredClone(target);
    other.date = "2026-07-18";
    const draft = [
      {
        item_id: hidden,
        patch: { report_hidden: true, report_date: "2026-07-17" },
        base_document: {},
      },
    ];

    applyDraft(target, draft);
    applyDraft(other, draft);

    expect(target.items).toEqual([{ id: retained, related_source_ids: [] }]);
    expect(
      (target.batches as Array<{ item_ids: string[] }>)[0].item_ids,
    ).toEqual([retained]);
    expect(target.overview).toMatchObject({ kind: "fallback" });
    expect(
      (other.items as Array<{ id: string }>).map((item) => item.id),
    ).toEqual([hidden, retained]);
  });

  it("fails closed on malformed report hide patches", () => {
    expect(() =>
      applyDraft({ date: "2026-07-17", items: [], batches: [] }, [
        {
          item_id: `n_${"a".repeat(64)}`,
          patch: { report_hidden: true },
          base_document: {},
        },
      ]),
    ).toThrow("Report hide patch is malformed");
  });
});

describe("global suppression materialization", () => {
  it("removes the item, batch placement, related references and generated overview text", () => {
    const suppressed = `n_${"a".repeat(64)}`;
    const retained = `n_${"b".repeat(64)}`;
    const document: Record<string, unknown> = {
      overview: {
        text: "Overview that may quote the suppressed content",
        kind: "generated",
        provenance: { method: "ai", model: "test", prompt_version: "v1" },
      },
      items: [
        { id: suppressed, related_source_ids: [] },
        { id: retained, related_source_ids: [suppressed] },
      ],
      batches: [
        { id: "morning", item_ids: [suppressed, retained] },
        { id: "afternoon", item_ids: [] },
        { id: "night", item_ids: [] },
        { id: "lateNight", item_ids: [] },
      ],
    };

    applyGlobalSuppression(document, suppressed);

    expect(document.items).toEqual([{ id: retained, related_source_ids: [] }]);
    expect(
      (document.batches as Array<{ item_ids: string[] }>)[0].item_ids,
    ).toEqual([retained]);
    expect(document.overview).toEqual({
      text: "本期日报已根据全局内容下架请求更新。",
      kind: "fallback",
      provenance: { method: "template", model: null, prompt_version: null },
    });
  });

  it("fails closed unless the target appears exactly once", () => {
    const item = `n_${"a".repeat(64)}`;
    const base = { items: [], batches: [{ item_ids: [] }] };

    expect(() => applyGlobalSuppression(structuredClone(base), item)).toThrow(
      "Suppressed item is not uniquely present",
    );
    expect(() =>
      applyGlobalSuppression(
        {
          items: [{ id: item }, { id: item }],
          batches: [{ item_ids: [item] }],
        },
        item,
      ),
    ).toThrow("Suppressed item is not uniquely present");
  });
});
