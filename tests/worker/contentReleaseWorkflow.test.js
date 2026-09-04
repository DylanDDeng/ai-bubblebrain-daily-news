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
    expect(workflow).toContain("expected_manifest_sha:");
    expect(workflow).toContain(
      "CONTENT_MANIFEST_SHA256: ${{ github.event.inputs.expected_manifest_sha }}",
    );
    expect(workflow).toContain(
      '[[ "$CONTENT_MANIFEST_SHA256" =~ ^[0-9a-f]{64}$ ]]',
    );
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
      "node release-control/scripts/materialize-content-addressed-artifact.mjs server-resume-plan.json astro/dist/client",
    );
    expect(workflow).toMatch(
      /- name: Checkout protected release controls for resumed artifacts\n\s+if: \$\{\{ steps\.resume\.outputs\.stage == 'preview' \}\}/,
    );
    expect(workflow).toContain(
      "TRUSTED_RELEASE_CONTROL_SHA: ${{ github.workflow_sha }}",
    );
    expect(workflow).toContain("ref: ${{ github.workflow_sha }}");
    expect(workflow).toContain("path: release-control");
    expect(workflow).toContain(
      'git -C release-control merge-base --is-ancestor "$EXACT_CODE_SHA" "$TRUSTED_RELEASE_CONTROL_SHA"',
    );
    expect(workflow).toMatch(
      /- name: Materialize exact registered R2 artifact\n\s+if: \$\{\{ steps\.resume\.outputs\.stage == 'preview' && steps\.preview-reuse\.outputs\.reused != 'true' \}\}/,
    );
    expect(workflow).toContain(
      "if: ${{ steps.resume.outputs.stage == 'build' }}",
    );
    expect(workflow).toMatch(
      /- name: Verify Preview route parity and exact bytes\n\s+if: \$\{\{ steps\.resume\.outputs\.stage == 'build' \|\| \(steps\.resume\.outputs\.stage == 'preview' && steps\.preview-reuse\.outputs\.reused != 'true'\) \}\}/,
    );
    expect(workflow).toMatch(
      /- name: Record Preview evidence\n\s+if: \$\{\{ steps\.resume\.outputs\.stage != 'promote' \}\}/,
    );
    expect(workflow).toContain(
      "Materialize trusted Preview verification baseline",
    );
    expect(workflow).toContain("--preview-verification-baseline");
    expect(workflow).toContain("Reuse exact existing Pages Preview");
    expect(workflow).toContain(
      "https://release-$CONTENT_RELEASE_SEQUENCE.bubble-content-preview.pages.dev",
    );
    expect(workflow).toContain("steps.preview-reuse.outputs.reused != 'true'");
    expect(workflow).toContain('R2_MATERIALIZE_CONCURRENCY: "32"');
    expect(workflow).toContain(
      'verifier="release-control/scripts/verify-preview.mjs"',
    );
    expect(workflow).toContain(
      'node "$verifier" "$PREVIEW_URL" "$EXACT_CODE_SHA"',
    );
    expect(workflow).toContain(
      "CONTENT_SCHEMA_VERSION: ${{ vars.CONTENT_SCHEMA_VERSION || '1' }}",
    );
    expect(workflow).toContain(
      "CONTENT_TAXONOMY_VERSION: ${{ vars.CONTENT_TAXONOMY_VERSION || '1' }}",
    );
    expect(workflow).toContain(
      "CONTENT_SERIALIZER_VERSION: ${{ vars.CONTENT_SERIALIZER_VERSION || 'daily-json-c14n-v1' }}",
    );
    expect(workflow).toContain(
      "CONTENT_SEARCH_CONTRACT_VERSION: ${{ vars.CONTENT_SEARCH_CONTRACT_VERSION || 'search-v1' }}",
    );
    expect(workflow).toContain(
      "CONTENT_SOURCE_CONTRACT_VERSION: ${{ vars.CONTENT_SOURCE_CONTRACT_VERSION || 'daily-source-v1' }}",
    );
    expect(workflow).toContain(
      "node scripts/request-production-promotion.mjs > broker-result.json",
    );
    expect(workflow).toContain(
      "jq -e '.ok == true and (.site_release_id == env.SITE_RELEASE_ID)' broker-result.json",
    );
    expect(deployerConfig).toContain('CONTENT_RELEASE_RESUME_ENABLED = "true"');
    expect(deployerConfig).toContain(
      'CONTENT_RELEASE_INCREMENTAL_REUSE_ENABLED = "false"',
    );
    expect(deployerConfig).toContain(
      'CONTENT_RELEASE_REQUIRE_FENCED_CALLBACKS = "true"',
    );
    expect(deployerConfig).toContain('CONTENT_BACKLOG_REPLAY_ENABLED = "true"');
    expect(deployerConfig).toContain('binding = "CONTENT_INGESTOR"');
    expect(deployerConfig).toContain('service = "ai-daily"');
    expect(deployerConfig).toContain("CONTENT_BACKLOG_REPLAY_SECRET");
  });
});
