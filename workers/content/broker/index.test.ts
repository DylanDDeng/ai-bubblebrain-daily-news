import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import contentBroker, {
  deploymentMatchesContext,
  handleRollbackRequest,
  isCommittedPromotionContext,
  pagesAssetHash,
  parseContentAddressedArtifact,
  parseDeterministicTar,
  performPromotion,
  ProductionCoordinator,
  purgeContentCaches,
  reconcileProduction,
  uploadPages,
  validatePromotion,
  verifyDeployment,
  verifyOrRepairCurrentDeployment,
} from "./index";

function fakeCoordinatorState() {
  const values = new Map<string, unknown>();
  const alarms: number[] = [];
  const storage = {
    get: vi.fn(async (key: string) => values.get(key)),
    put: vi.fn(async (key: string, value: unknown) => {
      values.set(key, structuredClone(value));
    }),
    delete: vi.fn(async (key: string) => {
      values.delete(key);
    }),
    setAlarm: vi.fn(async (timestamp: number) => {
      alarms.push(timestamp);
    }),
    deleteAlarm: vi.fn(async () => undefined),
    transaction: vi.fn(
      async (operation: (transaction: typeof storage) => Promise<unknown>) =>
        operation(storage),
    ),
  };
  return { state: { storage } as never, values, alarms };
}

describe("production coordinator", () => {
  it("enqueues scheduled reconcile once without polling operation status", async () => {
    const operationId = "123e4567-e89b-42d3-a456-426614174000";
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ operation_id: operationId }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const env = {
      PAGES_PROJECT: "content-pages",
      PRODUCTION_COORDINATOR: {
        idFromName: vi.fn(() => ({ name: "coordinator" })),
        get: vi.fn(() => ({ fetch })),
      },
    } as never;
    let pending: Promise<unknown> | undefined;
    const context = {
      waitUntil: vi.fn((value: Promise<unknown>) => {
        pending = value;
      }),
    } as never;

    contentBroker.scheduled({} as never, env, context);
    await pending;

    expect(fetch).toHaveBeenCalledOnce();
    const request = fetch.mock.calls[0][0] as Request;
    expect(new URL(request.url).pathname).toBe("/internal/enqueue");
    await expect(request.json()).resolves.toEqual({
      kind: "reconcile",
      payload: null,
    });
    expect(
      fetch.mock.calls.some(([candidate]) =>
        new URL(String((candidate as Request).url)).pathname.startsWith(
          "/internal/operations/",
        ),
      ),
    ).toBe(false);
  });

  it("serializes queued Pages mutations even when another alarm fires", async () => {
    const { state } = fakeCoordinatorState();
    let releaseFirst!: () => void;
    let firstStarted!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const started = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });
    const executionOrder: string[] = [];
    const execute = vi.fn(async (operation: { id: string }) => {
      executionOrder.push(operation.id);
      if (executionOrder.length === 1) {
        firstStarted();
        await firstGate;
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const coordinator = new ProductionCoordinator(
      state,
      {} as never,
      execute as never,
    );

    const first = await coordinator.fetch(
      new Request("https://coordinator.internal/internal/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "promote", payload: { release: "a" } }),
      }),
    );
    const second = await coordinator.fetch(
      new Request("https://coordinator.internal/internal/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "rollback", payload: { release: "b" } }),
      }),
    );
    const firstId = String(
      ((await first.json()) as { operation_id: string }).operation_id,
    );
    const secondId = String(
      ((await second.json()) as { operation_id: string }).operation_id,
    );

    const activeAlarm = coordinator.alarm();
    await started;
    await coordinator.alarm();
    expect(executionOrder).toEqual([firstId]);

    releaseFirst();
    await activeAlarm;
    await coordinator.alarm();
    expect(executionOrder).toEqual([firstId, secondId]);
  });

  it("retries the same active operation before later work after an alarm crash", async () => {
    const { state, values, alarms } = fakeCoordinatorState();
    const storage = state.storage as unknown as {
      put: ReturnType<typeof vi.fn>;
    };
    const originalPut = storage.put.getMockImplementation();
    let failCompletedWrite = true;
    storage.put.mockImplementation(async (key: string, value: unknown) => {
      if (
        failCompletedWrite &&
        key.startsWith("production-operation:") &&
        (value as { status?: string }).status === "completed"
      ) {
        failCompletedWrite = false;
        throw new Error("simulated isolate reset after execution");
      }
      return originalPut?.(key, value);
    });
    const executed: string[] = [];
    const execute = vi.fn(async (operation: { id: string }) => {
      executed.push(operation.id);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const firstCoordinator = new ProductionCoordinator(
      state,
      {} as never,
      execute as never,
    );
    const accepted = await firstCoordinator.fetch(
      new Request("https://coordinator.internal/internal/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "reconcile", payload: null }),
      }),
    );
    const operationId = String(
      ((await accepted.json()) as { operation_id: string }).operation_id,
    );

    await expect(firstCoordinator.alarm()).rejects.toThrow(
      "simulated isolate reset",
    );
    expect(values.get("production-operation-active")).toBe(operationId);
    expect(
      (values.get(`production-operation:${operationId}`) as { status: string })
        .status,
    ).toBe("running");
    expect(alarms.some((alarm) => alarm > Date.now())).toBe(true);

    const restartedCoordinator = new ProductionCoordinator(
      state,
      {} as never,
      execute as never,
    );
    await restartedCoordinator.alarm();
    expect(executed).toEqual([operationId, operationId]);
    expect(
      values.get(`production-operation:${operationId}`) as {
        status: string;
        attempts: number;
      },
    ).toMatchObject({ status: "completed", attempts: 2 });
    expect(values.has("production-operation-active")).toBe(false);
  });

  it("deduplicates queued reconciles and prunes expired operation results", async () => {
    const { state, values } = fakeCoordinatorState();
    const expiredId = "123e4567-e89b-42d3-a456-426614174099";
    values.set(`production-operation:${expiredId}`, {
      id: expiredId,
      kind: "reconcile",
      payload: null,
      status: "completed",
      attempts: 1,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:01.000Z",
      completed_at: "2026-01-01T00:00:01.000Z",
    });
    values.set("production-operation-completed", [
      { id: expiredId, completed_at: "2026-01-01T00:00:01.000Z" },
    ]);
    const coordinator = new ProductionCoordinator(
      state,
      {} as never,
      vi.fn() as never,
    );
    const request = () =>
      new Request("https://coordinator.internal/internal/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "reconcile", payload: null }),
      });
    const first = (await (await coordinator.fetch(request())).json()) as {
      operation_id: string;
      deduplicated?: boolean;
    };
    const second = (await (await coordinator.fetch(request())).json()) as {
      operation_id: string;
      deduplicated?: boolean;
    };

    expect(second).toMatchObject({
      operation_id: first.operation_id,
      deduplicated: true,
    });
    expect(values.has(`production-operation:${expiredId}`)).toBe(false);
  });
});

describe("same-release production repair", () => {
  const context = {
    site_release_id: "123e4567-e89b-42d3-a456-426614174001",
    site_release_sequence: 167,
    code_sha: "a".repeat(40),
  } as never;
  const expectedDeploymentId = "123e4567-e89b-42d3-a456-426614174010";
  const exactDeploymentId = "123e4567-e89b-42d3-a456-426614174011";

  function repairSql() {
    const queries: string[] = [];
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join("?");
      queries.push(query);
      if (query.includes("get_current_pages_deployment_v1")) {
        return [
          {
            result: {
              pointer_generation: 56,
              pages_deployment_id: expectedDeploymentId,
            },
          },
        ];
      }
      if (query.includes("record_current_pages_repair_v1")) {
        return [
          {
            result: {
              site_release_id: context.site_release_id,
              generation: 57,
            },
          },
        ];
      }
      throw new Error(`Unexpected SQL: ${query}`);
    });
    Object.assign(sql, { json: vi.fn((value: unknown) => value) });
    return { sql, queries };
  }

  it("adopts an exact same-release deployment instead of rolling it back", async () => {
    const { sql, queries } = repairSql();
    const rollbackDeployment = vi.fn();
    const purge = vi.fn(async () => ({ urls: [] }));
    const evidence = {
      multi_edge_verified: true,
      site_release_id: context.site_release_id,
    };

    await expect(
      verifyOrRepairCurrentDeployment(context, sql as never, {} as never, {
        loadArtifact: vi.fn(async () => ({ kind: "tar", files: [] }) as never),
        latestDeployment: vi.fn(async () => ({
          id: exactDeploymentId,
          url: "https://exact-current.pages.dev",
          commitHash: "a".repeat(40),
          commitMessage: "content release 167",
        })),
        verify: vi.fn(async () => evidence),
        rollbackDeployment,
        purge,
      }),
    ).resolves.toMatchObject({
      healthy: true,
      repaired: true,
      repair_mode: "adopt_exact_deployment",
      deployment_id: exactDeploymentId,
    });

    expect(rollbackDeployment).not.toHaveBeenCalled();
    expect(purge).toHaveBeenCalledOnce();
    expect(queries.join("\n")).toContain("record_current_pages_repair_v1");
  });

  it("rolls production back to the pointer deployment when content drifted", async () => {
    const { sql, queries } = repairSql();
    const repairedDeploymentId = "123e4567-e89b-42d3-a456-426614174012";
    const verify = vi
      .fn()
      .mockRejectedValueOnce(new Error("release 166 is still live"))
      .mockResolvedValueOnce({
        multi_edge_verified: true,
        site_release_id: context.site_release_id,
      });
    const rollbackDeployment = vi.fn(async () => ({
      id: repairedDeploymentId,
      url: "https://repaired-current.pages.dev",
    }));

    await expect(
      verifyOrRepairCurrentDeployment(context, sql as never, {} as never, {
        loadArtifact: vi.fn(async () => ({ kind: "tar", files: [] }) as never),
        latestDeployment: vi.fn(async () => ({
          id: "123e4567-e89b-42d3-a456-426614174099",
          url: "https://stale.pages.dev",
          commitHash: "b".repeat(40),
          commitMessage: "content release 166",
        })),
        verify,
        rollbackDeployment,
        purge: vi.fn(async () => ({ urls: [] })),
      }),
    ).resolves.toMatchObject({
      healthy: true,
      repaired: true,
      repair_mode: "rollback_exact_deployment",
      deployment_id: repairedDeploymentId,
    });

    expect(rollbackDeployment).toHaveBeenCalledWith(
      expectedDeploymentId,
      expect.anything(),
    );
    expect(verify).toHaveBeenCalledTimes(2);
    expect(queries.join("\n")).toContain("record_current_pages_repair_v1");
  });
});

describe("promotion commit recovery", () => {
  it("accepts only the target release at the next pointer generation", () => {
    const context = {
      current_site_release_id: "target-release",
      pointer_generation: 8,
    } as never;
    expect(isCommittedPromotionContext(context, "target-release", 7)).toBe(
      true,
    );
    expect(isCommittedPromotionContext(context, "other-release", 7)).toBe(
      false,
    );
    expect(isCommittedPromotionContext(context, "target-release", 8)).toBe(
      false,
    );
  });

  it("recognizes the exact last-known-good Pages deployment", () => {
    const context = {
      code_sha: "a".repeat(40),
      site_release_sequence: 111,
    } as never;
    expect(
      deploymentMatchesContext(
        {
          id: "123e4567-e89b-42d3-a456-426614174000",
          url: "https://release.pages.dev",
          commitHash: "a".repeat(40),
          commitMessage: "content release 111",
        },
        context,
      ),
    ).toBe(true);
    expect(
      deploymentMatchesContext(
        {
          id: "123e4567-e89b-42d3-a456-426614174000",
          url: "https://release.pages.dev",
          commitHash: "a".repeat(40),
          commitMessage: "content release 110",
        },
        context,
      ),
    ).toBe(false);
  });

  it("repairs committed-pointer drift from the serialized reconciler", async () => {
    const current = {
      ...databaseContentContract,
      site_release_id: "123e4567-e89b-42d3-a456-426614174001",
      site_release_sequence: 167,
      manifest_sha256: "a".repeat(64),
      content_sha256: "b".repeat(64),
      artifact_object_key: `artifacts/sha256/${"c".repeat(64)}.json`,
      artifact_byte_length: 1,
      artifact_sha256: "c".repeat(64),
      artifact_fingerprint_sha256: "d".repeat(64),
      artifact_hash_algorithm: "sha256-content-addressed-pages-v1",
      code_sha: "e".repeat(40),
      build_environment_version: "node22.17-astro7-hugo0.147.9-v1",
      pointer_generation: 56,
      current_site_release_id: "123e4567-e89b-42d3-a456-426614174001",
    };
    const expectedDeploymentId = "123e4567-e89b-42d3-a456-426614174010";
    const repairedDeploymentId = "123e4567-e89b-42d3-a456-426614174011";
    const queries: string[] = [];
    const end = vi.fn(async () => undefined);
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join("?");
      queries.push(query);
      if (query.includes("begin_production_reconcile_v1")) {
        return [{ result: null }];
      }
      if (query.includes("get_current_release_v1")) {
        return [{ result: { site_release_id: current.site_release_id } }];
      }
      if (query.includes("get_production_deploy_context_v1")) {
        return [{ result: current }];
      }
      if (query.includes("get_current_pages_deployment_v1")) {
        return [
          {
            result: {
              pointer_generation: 56,
              pages_deployment_id: expectedDeploymentId,
            },
          },
        ];
      }
      if (query.includes("record_current_pages_repair_v1")) {
        return [
          {
            result: {
              site_release_id: current.site_release_id,
              generation: 57,
            },
          },
        ];
      }
      throw new Error(`Unexpected SQL: ${query}`);
    });
    Object.assign(sql, {
      json: vi.fn((value: unknown) => value),
      end,
    });
    const verify = vi
      .fn()
      .mockRejectedValueOnce(new Error("release 166 is still live"))
      .mockResolvedValueOnce({
        multi_edge_verified: true,
        site_release_id: current.site_release_id,
      });
    const rollbackDeployment = vi.fn(async () => ({
      id: repairedDeploymentId,
      url: "https://repaired-current.pages.dev",
    }));

    await expect(
      reconcileProduction({} as never, {
        openDatabase: vi.fn(() => sql as never),
        loadArtifact: vi.fn(async () => ({ kind: "tar", files: [] }) as never),
        latestDeployment: vi.fn(async () => ({
          id: "123e4567-e89b-42d3-a456-426614174099",
          url: "https://stale-current.pages.dev",
          commitHash: "f".repeat(40),
          commitMessage: "content release 166",
        })),
        verify,
        rollbackDeployment,
        purge: vi.fn(async () => ({ urls: [] })),
      }),
    ).resolves.toBe("restored");

    expect(rollbackDeployment).toHaveBeenCalledWith(
      expectedDeploymentId,
      expect.anything(),
    );
    expect(verify).toHaveBeenCalledTimes(2);
    expect(queries.join("\n")).toContain("record_current_pages_repair_v1");
    expect(end).toHaveBeenCalledWith({ timeout: 2 });
  });

  it("does not repair when the committed pointer generation changed", async () => {
    const current = {
      ...databaseContentContract,
      site_release_id: "123e4567-e89b-42d3-a456-426614174001",
      site_release_sequence: 167,
      manifest_sha256: "a".repeat(64),
      content_sha256: "b".repeat(64),
      artifact_object_key: `artifacts/sha256/${"c".repeat(64)}.json`,
      artifact_byte_length: 1,
      artifact_sha256: "c".repeat(64),
      artifact_fingerprint_sha256: "d".repeat(64),
      artifact_hash_algorithm: "sha256-content-addressed-pages-v1",
      code_sha: "e".repeat(40),
      build_environment_version: "node22.17-astro7-hugo0.147.9-v1",
      pointer_generation: 56,
      current_site_release_id: "123e4567-e89b-42d3-a456-426614174001",
    };
    let pointerReads = 0;
    const queries: string[] = [];
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join("?");
      queries.push(query);
      if (query.includes("begin_production_reconcile_v1")) {
        return [{ result: null }];
      }
      if (query.includes("get_current_release_v1")) {
        return [{ result: { site_release_id: current.site_release_id } }];
      }
      if (query.includes("get_production_deploy_context_v1")) {
        return [{ result: current }];
      }
      if (query.includes("get_current_pages_deployment_v1")) {
        pointerReads += 1;
        return [
          {
            result: {
              pointer_generation: pointerReads === 1 ? 56 : 57,
              pages_deployment_id: "123e4567-e89b-42d3-a456-426614174010",
            },
          },
        ];
      }
      throw new Error(`Unexpected SQL: ${query}`);
    });
    Object.assign(sql, {
      json: vi.fn((value: unknown) => value),
      end: vi.fn(async () => undefined),
    });
    const rollbackDeployment = vi.fn();
    const purge = vi.fn();

    await expect(
      reconcileProduction({} as never, {
        openDatabase: vi.fn(() => sql as never),
        loadArtifact: vi.fn(async () => ({ kind: "tar", files: [] }) as never),
        latestDeployment: vi.fn(async () => ({
          id: "123e4567-e89b-42d3-a456-426614174099",
          url: "https://stale-current.pages.dev",
          commitHash: "f".repeat(40),
          commitMessage: "content release 166",
        })),
        verify: vi.fn(async () => {
          throw new Error("release 166 is still live");
        }),
        rollbackDeployment,
        purge,
      }),
    ).resolves.toBe("superseded");

    expect(pointerReads).toBe(2);
    expect(rollbackDeployment).not.toHaveBeenCalled();
    expect(purge).not.toHaveBeenCalled();
    expect(queries.join("\n")).not.toContain("record_current_pages_repair_v1");
  });

  it("reuses an already restored deployment instead of uploading it again", async () => {
    const target = {
      site_release_id: "123e4567-e89b-42d3-a456-426614174001",
      site_release_sequence: 112,
      code_sha: "b".repeat(40),
    };
    const current = {
      site_release_id: "123e4567-e89b-42d3-a456-426614174000",
      site_release_sequence: 111,
      code_sha: "a".repeat(40),
    };
    const queries: string[] = [];
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join("?");
      queries.push(query);
      if (query.includes("begin_production_reconcile_v1")) {
        return [
          {
            result: {
              slot: {
                operation: "forward",
                fencing_token: 7,
                expected_pointer_generation: 49,
              },
              target,
              current,
            },
          },
        ];
      }
      if (query.includes("get_promotion_reconcile_context_v1")) {
        return [
          {
            result: {
              slot: {
                operation: "forward",
                fencing_token: 7,
                expected_pointer_generation: 49,
              },
              target,
              current,
            },
          },
        ];
      }
      if (query.includes("finish_production_recovery_v1")) return [];
      throw new Error(`Unexpected SQL: ${query}`);
    });
    const end = vi.fn(async () => undefined);
    Object.assign(sql, {
      json: vi.fn((value: unknown) => value),
      end,
    });
    const verify = vi
      .fn()
      .mockRejectedValueOnce(new Error("target is not current"))
      .mockResolvedValueOnce({ multi_edge_verified: true });
    const upload = vi.fn();
    const latest = {
      id: "123e4567-e89b-42d3-a456-426614174010",
      url: "https://release.pages.dev",
      commitHash: current.code_sha,
      commitMessage: "content release 111",
    };

    await expect(
      reconcileProduction({} as never, {
        openDatabase: vi.fn(() => sql as never),
        loadArtifact: vi.fn(async () => ({ kind: "tar", files: [] }) as never),
        upload,
        verify,
        latestDeployment: vi.fn(async () => latest),
        purge: vi.fn(),
      }),
    ).resolves.toBe("restored");

    expect(upload).not.toHaveBeenCalled();
    expect(verify).toHaveBeenNthCalledWith(
      2,
      current,
      latest.url,
      expect.anything(),
      expect.anything(),
      undefined,
    );
    expect(
      queries.some((query) => query.includes("finish_production_recovery_v1")),
    ).toBe(true);
    expect(end).toHaveBeenCalledWith({ timeout: 2 });
  });

  it("never restores a cached predecessor after a target commit is fenced", async () => {
    const target = {
      site_release_id: "123e4567-e89b-42d3-a456-426614174002",
      site_release_sequence: 167,
      code_sha: "b".repeat(40),
      manifest_sha256: "c".repeat(64),
      artifact_sha256: "d".repeat(64),
      build_environment_version: "node22.17-astro7-hugo0.147.9-v1",
    };
    const current = {
      site_release_id: "123e4567-e89b-42d3-a456-426614174001",
      site_release_sequence: 166,
      code_sha: "a".repeat(40),
    };
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join("?");
      if (query.includes("begin_production_reconcile_v1")) {
        return [
          {
            result: {
              slot: {
                operation: "forward",
                fencing_token: 41,
                expected_pointer_generation: 56,
              },
              target,
              current,
            },
          },
        ];
      }
      if (query.includes("commit_reconciled_production_promotion_v1")) {
        throw new Error("Stale production fencing token");
      }
      throw new Error(`Unexpected SQL: ${query}`);
    });
    Object.assign(sql, {
      json: vi.fn((value: unknown) => value),
      end: vi.fn(async () => undefined),
    });
    const upload = vi.fn();
    const verify = vi.fn(async () => ({ multi_edge_verified: true }));

    await expect(
      reconcileProduction({} as never, {
        openDatabase: vi.fn(() => sql as never),
        loadArtifact: vi.fn(async () => ({ kind: "tar", files: [] }) as never),
        upload,
        verify,
        latestDeployment: vi.fn(async () => ({
          id: "123e4567-e89b-42d3-a456-426614174099",
          url: "https://release-167.pages.dev",
          commitHash: target.code_sha,
          commitMessage: "content release 167",
        })),
        purge: vi.fn(),
      }),
    ).resolves.toBe("superseded");

    expect(upload).not.toHaveBeenCalled();
    expect(verify).toHaveBeenCalledTimes(1);
  });
});

const encoder = new TextEncoder();
const databaseContentContract = {
  schema_version: 1,
  taxonomy_version: 1,
  serializer_version: "daily-json-c14n-v1",
  search_contract_version: "search-v1",
  source_contract_version: "daily-source-v1",
};
const routeContentContract = {
  content_schema_version: 1,
  content_taxonomy_version: 1,
  content_serializer_version: "daily-json-c14n-v1",
  content_search_contract_version: "search-v1",
  content_source_contract_version: "daily-source-v1",
  node_version: "v22.17.0",
  npm_version: "10.9.2",
  astro_version: "7.0.9",
  hugo_version: "0.147.9",
  build_timezone: "UTC",
  build_locale: "C.UTF-8",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("attempt-fenced production promotion", () => {
  const releaseId = "123e4567-e89b-42d3-a456-426614174001";
  const dispatchId = "123e4567-e89b-42d3-a456-426614174002";
  const attemptToken = "123e4567-e89b-42d3-a456-426614174003";
  const context = {
    ...databaseContentContract,
    site_release_id: releaseId,
    site_release_sequence: 167,
    expected_predecessor_id: null,
    manifest_sha256: "a".repeat(64),
    content_sha256: "b".repeat(64),
    artifact_object_key: `artifacts/sha256/${"c".repeat(64)}.json`,
    artifact_byte_length: 1,
    artifact_sha256: "c".repeat(64),
    artifact_fingerprint_sha256: "e".repeat(64),
    artifact_hash_algorithm: "sha256-content-addressed-pages-v1",
    code_sha: "d".repeat(40),
    build_environment_version: "node22.17-astro7-hugo0.147.9-v1",
    pointer_generation: 56,
    current_site_release_id: "123e4567-e89b-42d3-a456-426614174000",
  };
  const request = {
    dispatch_id: dispatchId,
    site_release_id: releaseId,
    attempt_token: attemptToken,
    execution_generation: 2,
    site_release_sequence: 167,
    expected_predecessor_id: null,
    artifact_sha256: "c".repeat(64),
    artifact_object_key: `artifacts/sha256/${"c".repeat(64)}.json`,
    code_sha: "d".repeat(40),
    content_sha256: "b".repeat(64),
    build_environment_version: "node22.17-astro7-hugo0.147.9-v1",
  };

  function promotionSql(
    queryHandler: (query: string) => Promise<unknown> | unknown,
  ) {
    const queries: string[] = [];
    const end = vi.fn(async () => undefined);
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join("?");
      queries.push(query);
      return queryHandler(query);
    });
    Object.assign(sql, {
      json: vi.fn((value: unknown) => value),
      end,
    });
    return { sql, queries, end };
  }

  it("requires the workflow attempt identity in every broker request", () => {
    expect(() => validatePromotion({ ...request })).not.toThrow();
    expect(() =>
      validatePromotion({ ...request, attempt_token: undefined }),
    ).toThrow("Invalid production promotion request");
    expect(() =>
      validatePromotion({ ...request, execution_generation: 0 }),
    ).toThrow("Invalid production promotion request");
  });

  it("rejects a stale same-release attempt before any Pages side effect", async () => {
    const { sql, queries, end } = promotionSql((query) => {
      if (query.includes("get_production_deploy_context_v1")) {
        return [{ result: { ...context, current_site_release_id: releaseId } }];
      }
      if (query.includes("authorize_attempt_production_promotion_v1")) {
        throw new Error("Stale production deployment attempt");
      }
      throw new Error(`Unexpected SQL: ${query}`);
    });
    const loadArtifact = vi.fn();
    const upload = vi.fn();
    const verify = vi.fn();
    const purge = vi.fn();

    const response = await performPromotion(request, {} as never, {
      openDatabase: vi.fn(() => sql as never),
      loadArtifact,
      upload,
      verify,
      purge,
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "promotion_failed",
      stage: "authorize_attempt",
    });
    expect(queries.join("\n")).toContain(
      "authorize_attempt_production_promotion_v1",
    );
    expect(loadArtifact).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
    expect(purge).not.toHaveBeenCalled();
    expect(end).toHaveBeenCalledWith({ timeout: 2 });
  });

  it("uses attempt-fenced authorize and commit RPCs for a forward write", async () => {
    const { sql, queries, end } = promotionSql((query) => {
      if (query.includes("get_production_deploy_context_v1")) {
        return [{ result: context }];
      }
      if (query.includes("authorize_attempt_production_promotion_v1")) {
        return [
          {
            result: {
              already_committed: false,
              fencing_token: 19,
              expected_pointer_generation: 56,
            },
          },
        ];
      }
      if (
        query.includes("mark_promotion_deploying_v1") ||
        query.includes("mark_promotion_verifying_v1")
      ) {
        return [];
      }
      if (query.includes("commit_attempt_production_promotion_v1")) {
        return [
          {
            result: {
              site_release_id: releaseId,
              generation: 57,
            },
          },
        ];
      }
      throw new Error(`Unexpected SQL: ${query}`);
    });
    const artifact = { kind: "tar", files: [] } as never;
    const deployment = {
      id: "123e4567-e89b-42d3-a456-426614174010",
      url: "https://release-167.pages.dev",
    };
    const upload = vi.fn(async () => deployment);

    const response = await performPromotion(request, {} as never, {
      openDatabase: vi.fn(() => sql as never),
      loadArtifact: vi.fn(async () => artifact),
      upload,
      verify: vi.fn(async () => ({ multi_edge_verified: true })),
      purge: vi.fn(async () => ({ urls: [] })),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      site_release_id: releaseId,
      deployment_id: deployment.id,
      generation: 57,
    });
    expect(upload).toHaveBeenCalledOnce();
    expect(queries.join("\n")).toContain(
      "authorize_attempt_production_promotion_v1",
    );
    expect(queries.join("\n")).toContain(
      "commit_attempt_production_promotion_v1",
    );
    expect(
      queries.some((query) =>
        query.includes("select private.authorize_production_promotion_v1"),
      ),
    ).toBe(false);
    expect(
      queries.some((query) =>
        query.includes("select private.commit_production_promotion_v1"),
      ),
    ).toBe(false);
    expect(end).toHaveBeenCalledWith({ timeout: 2 });
  });

  it("acknowledges an already committed exact attempt without repair", async () => {
    const { sql, queries } = promotionSql((query) => {
      if (query.includes("get_production_deploy_context_v1")) {
        return [{ result: { ...context, current_site_release_id: releaseId } }];
      }
      if (query.includes("authorize_attempt_production_promotion_v1")) {
        return [
          {
            result: {
              already_committed: true,
              expected_pointer_generation: 57,
            },
          },
        ];
      }
      throw new Error(`Unexpected SQL: ${query}`);
    });
    const upload = vi.fn();
    const verify = vi.fn();
    const purge = vi.fn();

    const response = await performPromotion(request, {} as never, {
      openDatabase: vi.fn(() => sql as never),
      upload,
      verify,
      purge,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      idempotent: true,
      site_release_id: releaseId,
      generation: 57,
    });
    expect(queries).toHaveLength(2);
    expect(upload).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
    expect(purge).not.toHaveBeenCalled();
  });
});

function octal(value: number, width: number): Uint8Array {
  return encoder.encode(`${value.toString(8).padStart(width - 1, "0")}\0`);
}

function tar(entries: Array<{ path: string; body: string }>): Uint8Array {
  const chunks: Uint8Array[] = [];
  for (const entry of entries) {
    const body = encoder.encode(entry.body);
    const header = new Uint8Array(512);
    header.set(encoder.encode(entry.path), 0);
    header.set(octal(0o644, 8), 100);
    header.set(octal(0, 8), 108);
    header.set(octal(0, 8), 116);
    header.set(octal(body.byteLength, 12), 124);
    header.set(octal(0, 12), 136);
    header.fill(32, 148, 156);
    header[156] = 48;
    header.set(encoder.encode("ustar\0"), 257);
    header.set(encoder.encode("00"), 263);
    const checksum = header.reduce((sum, value) => sum + value, 0);
    header.set(
      encoder.encode(`${checksum.toString(8).padStart(6, "0")}\0 `),
      148,
    );
    chunks.push(
      header,
      body,
      new Uint8Array((512 - (body.byteLength % 512)) % 512),
    );
  }
  chunks.push(new Uint8Array(1024));
  const output = new Uint8Array(
    chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

describe("production artifact tar", () => {
  it("parses only checksum-valid regular files", () => {
    const files = parseDeterministicTar(
      tar([
        { path: "./index.html", body: "<h1>release</h1>" },
        { path: "./release-manifests/site-route-manifest.json", body: "{}" },
      ]),
    );
    expect(files.map((file) => file.path)).toEqual([
      "index.html",
      "release-manifests/site-route-manifest.json",
    ]);
    expect(new TextDecoder().decode(files[0].bytes)).toBe("<h1>release</h1>");
  });

  it("rejects traversal paths before upload", () => {
    expect(() =>
      parseDeterministicTar(tar([{ path: "../escape.html", body: "x" }])),
    ).toThrow("unsafe path");
  });

  it("binds the Pages asset hash to bytes and extension", () => {
    const bytes = encoder.encode("same bytes");
    const html = pagesAssetHash({ path: "index.html", bytes });
    expect(html).toMatch(/^[a-f0-9]{32}$/);
    expect(pagesAssetHash({ path: "index.html", bytes })).toBe(html);
    expect(pagesAssetHash({ path: "index.txt", bytes })).not.toBe(html);
  });
});

describe("content-addressed production artifact", () => {
  const fingerprint =
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  const context = {
    ...databaseContentContract,
    site_release_id: "019f6e2d-013f-7ea0-933e-b996531a9341",
    site_release_sequence: 7,
    manifest_sha256: "a".repeat(64),
    content_sha256: "b".repeat(64),
    artifact_object_key: `artifacts/sha256/${"c".repeat(64)}.json`,
    artifact_byte_length: 1,
    artifact_sha256: "c".repeat(64),
    artifact_fingerprint_sha256: fingerprint,
    artifact_hash_algorithm: "sha256-content-addressed-pages-v1",
    code_sha: "d".repeat(40),
    build_environment_version: "node22.17-astro7-hugo0.147.9-v1",
  };
  function manifest(overrides: Record<string, unknown> = {}): Uint8Array {
    return encoder.encode(
      JSON.stringify({
        schema_version: 1,
        hash_algorithm: "sha256-content-addressed-pages-v1",
        build: {
          ...routeContentContract,
          code_sha: context.code_sha,
          source_sha: context.code_sha,
          site_release_id: context.site_release_id,
          site_release_sequence: context.site_release_sequence,
          content_sha256: context.content_sha256,
          manifest_sha256: context.manifest_sha256,
          build_environment_version: context.build_environment_version,
          hash_algorithm: "sha256-path-and-content-v1",
          artifact_sha256: fingerprint,
        },
        artifact_fingerprint_sha256: fingerprint,
        file_count: 1,
        total_asset_bytes: 2,
        files: [
          {
            path: "release-manifests/site-route-manifest.json",
            byte_length: 2,
            sha256: "e".repeat(64),
            pages_hash: "f".repeat(32),
            object_key: `assets/sha256/${"e".repeat(64)}`,
          },
        ],
        ...overrides,
      }),
    );
  }

  it("accepts a bounded path/hash inventory bound to the release identity", async () => {
    await expect(
      parseContentAddressedArtifact(manifest(), context),
    ).resolves.toMatchObject({
      file_count: 1,
      total_asset_bytes: 2,
    });
  });

  it("rejects missing or database-drifted content contract metadata", async () => {
    const missing = JSON.parse(new TextDecoder().decode(manifest()));
    delete missing.build.content_taxonomy_version;
    await expect(
      parseContentAddressedArtifact(
        encoder.encode(JSON.stringify(missing)),
        context,
      ),
    ).rejects.toThrow("identity mismatch");

    await expect(
      parseContentAddressedArtifact(manifest(), {
        ...context,
        serializer_version: "daily-json-c14n-v2",
      }),
    ).rejects.toThrow("identity mismatch");
  });

  it("rejects unsafe paths and inconsistent totals", async () => {
    await expect(
      parseContentAddressedArtifact(
        manifest({
          files: [
            {
              path: "../escape.html",
              byte_length: 2,
              sha256: "e".repeat(64),
              pages_hash: "f".repeat(32),
              object_key: `assets/sha256/${"e".repeat(64)}`,
            },
          ],
        }),
        context,
      ),
    ).rejects.toThrow("asset is invalid");
    await expect(
      parseContentAddressedArtifact(
        manifest({ total_asset_bytes: 3 }),
        context,
      ),
    ).rejects.toThrow("totals are invalid");
  });
});

describe("content-addressed Pages upload", () => {
  const pageBytes = encoder.encode("<h1>release</h1>");
  const context = {
    ...databaseContentContract,
    site_release_id: "019f6e2d-013f-7ea0-933e-b996531a9341",
    site_release_sequence: 7,
    manifest_sha256: "a".repeat(64),
    content_sha256: "b".repeat(64),
    artifact_object_key: `artifacts/sha256/${"c".repeat(64)}.json`,
    artifact_byte_length: 1,
    artifact_sha256: "c".repeat(64),
    artifact_fingerprint_sha256: "e".repeat(64),
    artifact_hash_algorithm: "sha256-content-addressed-pages-v1",
    code_sha: "d".repeat(40),
    build_environment_version: "node22.17-astro7-hugo0.147.9-v1",
  };

  function setup(storedPageBytes = pageBytes) {
    const routeBytes = encoder.encode("{}");
    const pageHash = pagesAssetHash({ path: "index.html", bytes: pageBytes });
    const routeHash = pagesAssetHash({
      path: "release-manifests/site-route-manifest.json",
      bytes: routeBytes,
    });
    const pageSha = createHash("sha256").update(pageBytes).digest("hex");
    const routeSha = createHash("sha256").update(routeBytes).digest("hex");
    const files = [
      {
        path: "index.html",
        byte_length: pageBytes.byteLength,
        sha256: pageSha,
        pages_hash: pageHash,
        object_key: `assets/sha256/${pageSha}`,
      },
      {
        path: "release-manifests/site-route-manifest.json",
        byte_length: routeBytes.byteLength,
        sha256: routeSha,
        pages_hash: routeHash,
        object_key: `assets/sha256/${routeSha}`,
      },
    ];
    const requests: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
        const url = String(input);
        requests.push({ url, init });
        let result: unknown;
        if (url.endsWith("/upload-token")) result = { jwt: "pages-jwt" };
        else if (url.endsWith("/check-missing")) result = [pageHash];
        else if (url.endsWith("/assets/upload")) result = {};
        else if (url.endsWith("/upsert-hashes")) result = {};
        else if (url.endsWith("/deployments")) {
          result = {
            id: "123e4567-e89b-42d3-a456-426614174000",
            url: "https://release.pages.dev",
          };
        } else throw new Error(`Unexpected URL: ${url}`);
        return new Response(JSON.stringify({ success: true, result }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
    const get = vi.fn(async (key: string) => {
      const value = key.endsWith(pageSha) ? storedPageBytes : routeBytes;
      return {
        size: value.byteLength,
        arrayBuffer: async () => value.slice().buffer,
      };
    });
    return {
      bundle: {
        kind: "content-addressed" as const,
        manifest: {
          schema_version: 1 as const,
          hash_algorithm: "sha256-content-addressed-pages-v1" as const,
          build: {},
          artifact_fingerprint_sha256: "e".repeat(64),
          file_count: files.length,
          total_asset_bytes: files.reduce(
            (sum, file) => sum + file.byte_length,
            0,
          ),
          files,
        },
      },
      env: {
        ARTIFACTS: { get },
        PAGES_PROJECT: "production-project",
        CLOUDFLARE_ACCOUNT_ID: "account-id",
        CLOUDFLARE_API_TOKEN: "api-token",
        PRODUCTION_BRANCH: "main",
      },
      get,
      requests,
      pageHash,
    };
  }

  it("fetches only missing immutable R2 assets before direct upload", async () => {
    const value = setup();
    await expect(
      uploadPages(value.bundle, context, value.env as never),
    ).resolves.toEqual({
      id: "123e4567-e89b-42d3-a456-426614174000",
      url: "https://release.pages.dev",
    });
    expect(value.get).toHaveBeenCalledTimes(1);
    expect(value.get).toHaveBeenCalledWith(
      `assets/sha256/${createHash("sha256").update(pageBytes).digest("hex")}`,
    );
    const upload = value.requests.find(({ url }) =>
      url.endsWith("/assets/upload"),
    );
    expect(JSON.parse(String(upload?.init.body))).toEqual([
      expect.objectContaining({ key: value.pageHash, base64: true }),
    ]);
  });

  it("stops before Pages upload when an immutable R2 asset length drifts", async () => {
    const value = setup(pageBytes.slice(1));
    await expect(
      uploadPages(value.bundle, context, value.env as never),
    ).rejects.toThrow("asset is unavailable");
    expect(
      value.requests.some(({ url }) => url.endsWith("/assets/upload")),
    ).toBe(false);
  });
});

describe("production convergence verification", () => {
  const context = {
    ...databaseContentContract,
    site_release_id: "019f6e2d-013f-7ea0-933e-b996531a9341",
    site_release_sequence: 7,
    manifest_sha256: "a".repeat(64),
    content_sha256: "b".repeat(64),
    artifact_object_key: `artifacts/sha256/${"c".repeat(64)}.json`,
    artifact_byte_length: 1,
    artifact_sha256: "c".repeat(64),
    artifact_fingerprint_sha256: "e".repeat(64),
    artifact_hash_algorithm: "sha256-content-addressed-pages-v1",
    code_sha: "d".repeat(40),
    build_environment_version: "node22.17-astro7-hugo0.147.9-v1",
  };
  const files = [
    { path: "index.html", bytes: encoder.encode("<h1>home</h1>") },
    {
      path: "daily/2026/07/2026-07-17/index.html",
      bytes: encoder.encode("<h1>daily</h1>"),
    },
    {
      path: "data/daily/2026-07-17.json",
      bytes: encoder.encode('{"date":"2026-07-17"}'),
    },
    {
      path: "search/index.json",
      bytes: encoder.encode('{"items":[]}'),
    },
  ];

  function build() {
    return {
      ...routeContentContract,
      code_sha: context.code_sha,
      source_sha: context.code_sha,
      site_release_id: context.site_release_id,
      site_release_sequence: context.site_release_sequence,
      content_sha256: context.content_sha256,
      manifest_sha256: context.manifest_sha256,
      artifact_sha256: context.artifact_fingerprint_sha256,
      build_environment_version: context.build_environment_version,
    };
  }

  function setup(
    corruptSearch = false,
    delayedManifestAttempts = 0,
    transformCustomHtml = false,
  ) {
    const manifestAttempts = new Map<string, number>();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.pathname === "/release-manifests/site-route-manifest.json") {
          const attempts = (manifestAttempts.get(url.origin) || 0) + 1;
          manifestAttempts.set(url.origin, attempts);
          const delayed =
            url.origin === "https://www.example.test" &&
            attempts <= delayedManifestAttempts;
          return new Response(
            JSON.stringify({
              build: delayed
                ? {
                    ...build(),
                    site_release_id: "019f6e2d-013f-7ea0-933e-b996531a9340",
                    site_release_sequence: context.site_release_sequence - 1,
                    code_sha: "f".repeat(40),
                    source_sha: "f".repeat(40),
                  }
                : build(),
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "cf-ray": "id-IAD",
              },
            },
          );
        }
        const path =
          url.pathname === "/"
            ? "index.html"
            : url.pathname.endsWith("/")
              ? `${url.pathname.slice(1)}index.html`
              : url.pathname.slice(1);
        const file = files.find((candidate) => candidate.path === path);
        const transformedHtml =
          transformCustomHtml &&
          url.origin === "https://www.example.test" &&
          path.endsWith(".html");
        const bytes =
          corruptSearch &&
          url.origin === "https://www.example.test" &&
          path === "search/index.json"
            ? encoder.encode("corrupt")
            : transformedHtml
              ? encoder.encode("cloudflare edge transformed html")
              : file?.bytes;
        return bytes
          ? new Response(bytes, { status: 200 })
          : new Response(null, { status: 404 });
      }),
    );
    return {
      env: {
        PRODUCTION_VERIFY_URLS: "https://www.example.test",
        VERIFY_MIN_ENDPOINTS: "2",
      } as never,
      manifestAttempts,
    };
  }

  function controlledClock(startedAt = 1_000_000) {
    let current = startedAt;
    return {
      startedAt,
      advance: (milliseconds: number) => {
        current += milliseconds;
      },
      dependencies: {
        now: () => current,
        sleep: async (milliseconds: number) => {
          current += milliseconds;
        },
      },
    };
  }

  it("requires exact HTML, daily JSON and search bytes on every origin", async () => {
    const value = setup();
    const clock = controlledClock();
    await expect(
      verifyDeployment(
        context,
        "https://deploy.pages.dev",
        value.env,
        {
          kind: "tar",
          files,
        },
        clock.startedAt,
        clock.dependencies,
      ),
    ).resolves.toMatchObject({
      multi_edge_verified: true,
      maximum_inconsistency_ms: 240000,
      convergence_elapsed_ms: expect.any(Number),
      stability_elapsed_ms: 120000,
      stable_verified_at: expect.any(String),
      stability_offsets: [15000, 45000, 120000],
      site_release_id: context.site_release_id,
      site_release_sequence: context.site_release_sequence,
      manifest_sha256: context.manifest_sha256,
      content_sha256: context.content_sha256,
      artifact_sha256: context.artifact_sha256,
      artifact_fingerprint_sha256: context.artifact_fingerprint_sha256,
      code_sha: context.code_sha,
      build_environment_version: context.build_environment_version,
      endpoints: [
        {
          exact_paths: [
            "/",
            "/daily/2026/07/2026-07-17/",
            "/data/daily/2026-07-17.json",
            "/search/index.json",
          ],
        },
        {
          exact_paths: [
            "/",
            "/daily/2026/07/2026-07-17/",
            "/data/daily/2026-07-17.json",
            "/search/index.json",
          ],
        },
      ],
    });
  });

  it("allows declared custom-domain HTML transforms while keeping two exact-byte origins", async () => {
    const value = setup(false, 0, true);
    const clock = controlledClock();
    await expect(
      verifyDeployment(
        context,
        "https://deploy.pages.dev",
        {
          ...value.env,
          PRODUCTION_VERIFY_URLS:
            "https://www.example.test,https://raw.example.test",
          TRANSFORMED_HTML_VERIFY_URLS: "https://www.example.test",
          VERIFY_MIN_ENDPOINTS: "3",
          VERIFY_MIN_EXACT_ENDPOINTS: "2",
        },
        { kind: "tar", files },
        clock.startedAt,
        clock.dependencies,
      ),
    ).resolves.toMatchObject({
      endpoints: expect.arrayContaining([
        expect.objectContaining({
          url: "https://www.example.test",
          exact_paths: ["/data/daily/2026-07-17.json", "/search/index.json"],
          edge_transformed_html_paths: ["/", "/daily/2026/07/2026-07-17/"],
        }),
        expect.objectContaining({
          url: "https://raw.example.test",
          exact_paths: [
            "/",
            "/daily/2026/07/2026-07-17/",
            "/data/daily/2026-07-17.json",
            "/search/index.json",
          ],
        }),
      ]),
    });
  });

  it("rejects transformed HTML when only one exact-byte origin remains", async () => {
    const value = setup(false, 0, true);
    await expect(
      verifyDeployment(
        context,
        "https://deploy.pages.dev",
        {
          ...value.env,
          TRANSFORMED_HTML_VERIFY_URLS: "https://www.example.test",
          VERIFY_MIN_EXACT_ENDPOINTS: "2",
        },
        { kind: "tar", files },
      ),
    ).rejects.toThrow("exact-byte verification is not configured");
  });

  it("continues beyond the legacy eight probes until a delayed edge converges", async () => {
    const value = setup(false, 9);
    const clock = controlledClock();
    await expect(
      verifyDeployment(
        context,
        "https://deploy.pages.dev",
        { ...value.env, MAX_PRODUCTION_INCONSISTENCY_MS: "20000" },
        { kind: "tar", files },
        clock.startedAt,
        { ...clock.dependencies, stabilityOffsetsMs: [] },
      ),
    ).resolves.toMatchObject({
      multi_edge_verified: true,
      endpoints: expect.arrayContaining([
        expect.objectContaining({
          url: "https://www.example.test",
          attempts: 10,
        }),
      ]),
    });
    expect(value.manifestAttempts.get("https://deploy.pages.dev")).toBe(1);
    expect(value.manifestAttempts.get("https://www.example.test")).toBe(10);
  });

  it("fails closed when a later stability round drifts after convergence", async () => {
    const value = setup();
    const clock = controlledClock();
    const baseFetch = vi.mocked(fetch);
    let configuredManifestProbes = 0;

    await expect(
      verifyDeployment(
        context,
        "https://deploy.pages.dev",
        value.env,
        { kind: "tar", files },
        clock.startedAt,
        {
          ...clock.dependencies,
          stabilityOffsetsMs: [15, 45, 120],
          fetch: async (input, init) => {
            const url = new URL(String(input));
            if (
              url.origin === "https://www.example.test" &&
              url.pathname.endsWith(
                "/release-manifests/site-route-manifest.json",
              )
            ) {
              configuredManifestProbes += 1;
              if (configuredManifestProbes === 3) {
                return new Response(
                  JSON.stringify({
                    build: {
                      ...routeContentContract,
                      site_release_id: "123e4567-e89b-42d3-a456-426614174099",
                    },
                  }),
                  {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                  },
                );
              }
            }
            return baseFetch(input, init);
          },
        },
      ),
    ).rejects.toThrow("release-manifests/site-route-manifest.json");
    expect(configuredManifestProbes).toBe(3);
  });

  it("supports one recovery probe so rollback retains the invocation budget", async () => {
    const value = setup(false, 9);
    const clock = controlledClock();
    await expect(
      verifyDeployment(
        context,
        "https://deploy.pages.dev",
        value.env,
        { kind: "tar", files },
        clock.startedAt,
        { ...clock.dependencies, maximumAttempts: 1 },
      ),
    ).rejects.toThrow("did not converge");
    expect(value.manifestAttempts.get("https://deploy.pages.dev")).toBe(1);
    expect(value.manifestAttempts.get("https://www.example.test")).toBe(1);
  });

  it("fails closed when a custom-domain search artifact drifts", async () => {
    const value = setup(true);
    const clock = controlledClock();
    await expect(
      verifyDeployment(
        context,
        "https://deploy.pages.dev",
        { ...value.env, MAX_PRODUCTION_INCONSISTENCY_MS: "10000" },
        { kind: "tar", files },
        clock.startedAt,
        clock.dependencies,
      ),
    ).rejects.toThrow("search/index.json");
  });

  it("rejects a probe that finishes after the hard convergence deadline", async () => {
    const value = setup();
    const clock = controlledClock();
    const fetcher = vi.mocked(fetch);
    let advanced = false;
    await expect(
      verifyDeployment(
        context,
        "https://deploy.pages.dev",
        { ...value.env, MAX_PRODUCTION_INCONSISTENCY_MS: "10000" },
        { kind: "tar", files },
        clock.startedAt,
        {
          ...clock.dependencies,
          fetch: async (input, init) => {
            const response = await fetcher(input, init);
            if (!advanced) {
              advanced = true;
              clock.advance(10_001);
            }
            return response;
          },
        },
      ),
    ).rejects.toThrow("within 10000ms");
  });

  it("rejects an unsafe inconsistency-window configuration", async () => {
    const value = setup();
    await expect(
      verifyDeployment(
        context,
        "https://deploy.pages.dev",
        {
          ...value.env,
          MAX_PRODUCTION_INCONSISTENCY_MS: "0",
        },
        { kind: "tar", files },
      ),
    ).rejects.toThrow("inconsistency limit is invalid");
  });

  it("fails before probing when the measured inconsistency window is exhausted", async () => {
    const value = setup();
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockClear();
    await expect(
      verifyDeployment(
        context,
        "https://deploy.pages.dev",
        value.env,
        { kind: "tar", files },
        Date.now() - 240_001,
      ),
    ).rejects.toThrow("inconsistency window exceeded");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("production rollback handler", () => {
  it("reuses an already exact rollback deployment before committing the fenced RPC", async () => {
    const targetId = "123e4567-e89b-42d3-a456-426614174000";
    const context = {
      ...databaseContentContract,
      site_release_id: targetId,
      site_release_sequence: 7,
      manifest_sha256: "a".repeat(64),
      content_sha256: "b".repeat(64),
      artifact_object_key: `artifacts/sha256/${"c".repeat(64)}.json`,
      artifact_byte_length: 1,
      artifact_sha256: "c".repeat(64),
      artifact_fingerprint_sha256: "e".repeat(64),
      artifact_hash_algorithm: "sha256-content-addressed-pages-v1",
      code_sha: "d".repeat(40),
      build_environment_version: "node22.17-astro7-hugo0.147.9-v1",
    };
    const queries: string[] = [];
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join("?");
      queries.push(query);
      if (query.includes("get_authorized_rollback_context_v1")) {
        return [{ result: context }];
      }
      if (query.includes("commit_production_rollback_v1")) {
        return [{ result: { site_release_id: targetId, generation: 8 } }];
      }
      throw new Error(`Unexpected SQL: ${query}`);
    });
    const end = vi.fn(async () => undefined);
    Object.assign(sql, {
      json: vi.fn((value: unknown) => value),
      end,
    });
    const loadArtifact = vi.fn(
      async () => ({ kind: "tar", files: [] }) as never,
    );
    const upload = vi.fn(async () => ({
      id: "123e4567-e89b-42d3-a456-426614174000",
      url: "https://rollback.pages.dev",
    }));
    const verify = vi.fn(async () => ({ multi_edge_verified: true }));
    const purge = vi.fn(async () => ({
      urls: ["https://content-api.example.test/v1/current"],
    }));
    const request = new Request("https://broker.test/v1/rollback", {
      method: "POST",
      headers: { "X-Content-Control-Secret": "control-secret" },
      body: JSON.stringify({
        target_site_release_id: targetId,
        fencing_token: 9,
        expected_pointer_generation: 7,
      }),
    });

    const response = await handleRollbackRequest(
      request,
      { CONTROL_BROKER_SECRET: "control-secret" } as never,
      {
        openDatabase: vi.fn(() => sql as never),
        loadArtifact,
        upload,
        verify,
        latestDeployment: vi.fn(async () => ({
          id: "123e4567-e89b-42d3-a456-426614174000",
          url: "https://rollback.pages.dev",
          commitHash: context.code_sha,
          commitMessage: "content release 7",
        })),
        purge,
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      site_release_id: targetId,
      generation: 8,
    });
    expect(loadArtifact).toHaveBeenCalledWith(context, expect.anything());
    expect(upload).not.toHaveBeenCalled();
    expect(verify).toHaveBeenCalledOnce();
    expect(purge).toHaveBeenCalledOnce();
    expect(queries).toHaveLength(2);
    expect(queries.join("\n")).not.toContain("sql<JsonRecord");
    expect(end).toHaveBeenCalledWith({ timeout: 2 });
  });

  it("does not commit or report rollback success when cache purge fails", async () => {
    const targetId = "123e4567-e89b-42d3-a456-426614174000";
    const context = {
      ...databaseContentContract,
      site_release_id: targetId,
      site_release_sequence: 7,
      manifest_sha256: "a".repeat(64),
      content_sha256: "b".repeat(64),
      artifact_object_key: `artifacts/sha256/${"c".repeat(64)}.json`,
      artifact_byte_length: 1,
      artifact_sha256: "c".repeat(64),
      artifact_fingerprint_sha256: "e".repeat(64),
      artifact_hash_algorithm: "sha256-content-addressed-pages-v1",
      code_sha: "d".repeat(40),
      build_environment_version: "node22.17-astro7-hugo0.147.9-v1",
    };
    const queries: string[] = [];
    const end = vi.fn(async () => undefined);
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join("?");
      queries.push(query);
      if (query.includes("get_authorized_rollback_context_v1")) {
        return [{ result: context }];
      }
      throw new Error("Rollback commit must not run after purge failure");
    });
    Object.assign(sql, {
      json: vi.fn((value: unknown) => value),
      end,
    });
    const request = new Request("https://broker.test/v1/rollback", {
      method: "POST",
      headers: { "X-Content-Control-Secret": "control-secret" },
      body: JSON.stringify({
        target_site_release_id: targetId,
        fencing_token: 9,
        expected_pointer_generation: 7,
      }),
    });

    const response = await handleRollbackRequest(
      request,
      { CONTROL_BROKER_SECRET: "control-secret" } as never,
      {
        openDatabase: vi.fn(() => sql as never),
        loadArtifact: vi.fn(async () => ({ kind: "tar", files: [] }) as never),
        upload: vi.fn(async () => ({
          id: "123e4567-e89b-42d3-a456-426614174000",
          url: "https://rollback.pages.dev",
        })),
        verify: vi.fn(async () => ({ multi_edge_verified: true })),
        latestDeployment: vi.fn(async () => {
          throw new Error("rollback target is not yet current");
        }),
        purge: vi.fn(async () => {
          throw new Error("purge failed");
        }),
      },
    );

    expect(response.status).toBe(503);
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain("get_authorized_rollback_context_v1");
    expect(end).toHaveBeenCalledOnce();
  });
});

describe("production cache purge", () => {
  it("purges only explicitly configured HTTPS current-pointer URLs", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ success: true, result: { id: "purge" } }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      CLOUDFLARE_ZONE_ID: "a".repeat(32),
      CLOUDFLARE_API_TOKEN: "purge-token",
      CONTENT_API_PURGE_URLS:
        "https://content-api.example.test/v1/current,https://api.example.test/v1/current",
    } as never;

    await expect(purgeContentCaches(env)).resolves.toEqual({
      urls: [
        "https://content-api.example.test/v1/current",
        "https://api.example.test/v1/current",
      ],
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(`/zones/${"a".repeat(32)}/purge_cache`);
    expect(JSON.parse(String(init?.body))).toEqual({
      files: [
        "https://content-api.example.test/v1/current",
        "https://api.example.test/v1/current",
      ],
    });
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer purge-token",
    );
  });

  it("fails closed before the Cloudflare API when purge configuration is missing or unsafe", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      purgeContentCaches({
        CLOUDFLARE_ZONE_ID: "placeholder",
        CONTENT_API_PURGE_URLS: "http://content-api.example.test/v1/current",
      } as never),
    ).rejects.toThrow("cache purge is not configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
