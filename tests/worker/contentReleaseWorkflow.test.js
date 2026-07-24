import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("fenced content release workflow", () => {
  it("derives resume stages from the deployer and materializes R2 checkpoints", async () => {
    const [workflow, deployerConfig] = await Promise.all([
      readFile(
        new URL("../../.github/workflows/content-release.yml", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../../wrangler.content-deployer.toml", import.meta.url),
        "utf8",
      ),
    ]);

    expect(workflow).toContain("attempt_token:");
    expect(workflow).toContain("execution_generation:");
    expect(workflow).toContain(
      'if [[ "$DEPLOYMENT_MODE" == "production" || -n "$DEPLOYMENT_ATTEMPT_TOKEN" || -n "$DEPLOYMENT_EXECUTION_GENERATION" ]]',
    );
    expect(workflow).toContain('--arg attempt "$DEPLOYMENT_ATTEMPT_TOKEN"');
    expect(workflow).toContain(
      '--argjson execution_generation "$DEPLOYMENT_EXECUTION_GENERATION"',
    );
    expect(workflow).toContain(
      "attempt_token:$attempt,execution_generation:$execution_generation",
    );
    expect(workflow).not.toMatch(/^\s{6}resume_stage:/m);
    expect(workflow).not.toMatch(/^\s{6}resume_plan:/m);
    expect(workflow).toContain(
      'node "$RUNNER_TEMP/content-release-helper.mjs" plan > server-resume-plan.json',
    );
    expect(
      workflow.indexOf("Create immutable fenced release helper"),
    ).toBeLessThan(workflow.indexOf("Checkout exact code SHA"));
    expect(workflow).toContain(
      "node scripts/materialize-content-addressed-artifact.mjs server-resume-plan.json astro/dist/client",
    );
    expect(workflow).toContain(
      "if: ${{ steps.resume.outputs.stage == 'build' }}",
    );
    expect(workflow).toContain(
      "if: ${{ steps.resume.outputs.stage != 'promote' }}",
    );
    expect(workflow).toContain(
      'node scripts/verify-preview.mjs "$PREVIEW_URL" "$EXACT_CODE_SHA"',
    );
    expect(deployerConfig).toContain(
      'CONTENT_RELEASE_RESUME_ENABLED = "true"',
    );
    expect(deployerConfig).toContain(
      'CONTENT_RELEASE_INCREMENTAL_REUSE_ENABLED = "false"',
    );
    expect(deployerConfig).toContain(
      'CONTENT_RELEASE_REQUIRE_FENCED_CALLBACKS = "true"',
    );
    expect(deployerConfig).toContain(
      'CONTENT_BACKLOG_REPLAY_ENABLED = "true"',
    );
    expect(deployerConfig).toContain('binding = "CONTENT_INGESTOR"');
    expect(deployerConfig).toContain('service = "ai-daily"');
    expect(deployerConfig).toContain("CONTENT_BACKLOG_REPLAY_SECRET");
  });
});
