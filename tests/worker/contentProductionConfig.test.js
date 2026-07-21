import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertR2Lock } from "../../scripts/assert-r2-lock.mjs";
import { assertContentRecoveryHealth } from "../../scripts/assert-content-recovery-health.mjs";
import { SHARED_CONTENT_PROJECT_ACK } from "../../scripts/content-database-topology.mjs";
import { validateAttestationRotationEnvironment } from "../../scripts/rotate-content-attestation-key.mjs";
import {
  validateWorkflowEnvironment,
  validateWranglerDocuments,
} from "../../scripts/validate-content-production-config.mjs";

const files = [
  "wrangler.content-admin.toml",
  "wrangler.content-api.toml",
  "wrangler.content-attestation.toml",
  "wrangler.content-broker.toml",
  "wrangler.content-control.toml",
  "wrangler.content-deployer.toml",
  "wrangler.content-editorial.toml",
];

function configuredWranglerDocuments() {
  const replacementId = "1234567890abcdef1234567890abcdef";
  return Object.fromEntries(
    files.map((name) => [
      name,
      readFileSync(name, "utf8")
        .replaceAll(
          "https://bubblebrain.cloudflareaccess.com",
          "https://isolated-team.cloudflareaccess.com",
        )
        .replaceAll("00000000000000000000000000000000", replacementId)
        .replaceAll(
          "REPLACE_WITH_ISOLATED_CONTENT_EDITOR_HYPERDRIVE_ID",
          replacementId,
        )
        .replaceAll(
          "REPLACE_WITH_ISOLATED_CONTENT_CONTROLLER_HYPERDRIVE_ID",
          replacementId,
        )
        .replaceAll(
          "REPLACE_WITH_ISOLATED_CONTENT_DEPLOYER_HYPERDRIVE_ID",
          replacementId,
        )
        .replaceAll(
          "REPLACE_WITH_ISOLATED_CONTENT_INGESTOR_HYPERDRIVE_ID",
          replacementId,
        )
        .replaceAll("REPLACE_WITH_PRODUCTION_ZONE_ID", replacementId)
        .replaceAll(
          "https://REPLACE_WITH_TEAM.cloudflareaccess.com",
          "https://isolated-team.cloudflareaccess.com",
        )
        .replaceAll(
          "REPLACE_WITH_ROUTINE_ADMIN_ACCESS_AUD",
          "routine_admin_access_audience_123456",
        )
        .replaceAll(
          "REPLACE_WITH_CONTROL_ACCESS_AUD",
          "control_access_audience_123456789",
        ),
    ]),
  );
}

describe("content production preflight", () => {
  it("rejects Wrangler placeholders and accepts the resolved repository set", () => {
    const unresolved = Object.fromEntries(
      files.map((name) => [name, readFileSync(name, "utf8")]),
    );
    unresolved["wrangler.content-admin.toml"] = unresolved[
      "wrangler.content-admin.toml"
    ].replace(
      /^CF_ACCESS_AUD = ".*"$/m,
      'CF_ACCESS_AUD = "REPLACE_WITH_ROUTINE_ADMIN_ACCESS_AUD"',
    );
    expect(() => validateWranglerDocuments(unresolved)).toThrow(
      /placeholder|invalid format/,
    );
    expect(validateWranglerDocuments(configuredWranglerDocuments())).toEqual({
      files: 7,
      maximumInconsistencyMs: 240000,
      minimumExactVerifierCount: 2,
      minimumVerifierCount: 3,
      transformedHtmlVerifierOrigins: 1,
      verifierOrigins: 2,
    });
  });

  it("rejects an Attestation audience that differs from its Access application", () => {
    const documents = configuredWranglerDocuments();
    documents["wrangler.content-attestation.toml"] = documents[
      "wrangler.content-attestation.toml"
    ].replace(
      /^CF_ACCESS_ROUTINE_AUD = ".*"$/m,
      'CF_ACCESS_ROUTINE_AUD = "different_routine_access_audience_123"',
    );
    expect(() => validateWranglerDocuments(documents)).toThrow(
      /audiences must exactly match/,
    );
  });

  it("requires an explicit blast-radius acknowledgement for shared recovery workflows", () => {
    expect(() =>
      validateWorkflowEnvironment("workflow-backup", {
        CONTENT_DATABASE_PROJECT_REF: "znurdobjryrhshzkalup",
        CONTENT_BACKUP_DATABASE_URL:
          "postgresql://postgres.znurdobjryrhshzkalup:secret@aws-0-us-east-1.pooler.supabase.com/postgres",
      }),
    ).toThrow(/shared Supabase project/);

    const sharedEnvironment = {
      CONTENT_DATABASE_PROJECT_REF: "znurdobjryrhshzkalup",
      CONTENT_DATABASE_TOPOLOGY: "shared_project",
      CONTENT_SHARED_PROJECT_ACK: SHARED_CONTENT_PROJECT_ACK,
      CONTENT_BACKUP_DATABASE_URL:
        "postgresql://content_backup.znurdobjryrhshzkalup:secret@aws-1-us-east-2.pooler.supabase.com/postgres",
      AGE_RECIPIENT: `age1${"a".repeat(58)}`,
      CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
      CLOUDFLARE_R2_LOCK_READ_TOKEN: "b".repeat(32),
      AWS_ACCESS_KEY_ID: "c".repeat(24),
      AWS_SECRET_ACCESS_KEY: "d".repeat(32),
    };
    expect(
      validateWorkflowEnvironment("workflow-backup", sharedEnvironment),
    ).toEqual({
      profile: "workflow-backup",
      projectRef: "znurdobjryrhshzkalup",
    });
    expect(() =>
      validateWorkflowEnvironment("workflow-backup", {
        ...sharedEnvironment,
        CONTENT_SHARED_PROJECT_ACK: "accepted",
      }),
    ).toThrow(/exact blast-radius acknowledgement/);
    expect(() =>
      validateWorkflowEnvironment("workflow-backup", {
        ...sharedEnvironment,
        CONTENT_BACKUP_DATABASE_URL:
          "postgresql://postgres.znurdobjryrhshzkalup:secret@aws-1-us-east-2.pooler.supabase.com/postgres",
      }),
    ).toThrow(/dedicated content_backup role/);
  });

  it("requires strict UUIDs and complete release credentials", () => {
    const environment = {
      DISPATCH_ID: "11111111-1111-4111-8111-111111111111",
      SITE_RELEASE_ID: "22222222-2222-4222-8222-222222222222",
      CONTENT_RELEASE_SEQUENCE: "9",
      CONTENT_ROOT_SHA256: "a".repeat(64),
      EXACT_CODE_SHA: "b".repeat(40),
      BUILD_ENVIRONMENT_VERSION: "node22.17-astro7-hugo0.147.9-v1",
      CONTENT_BUILD_API_ORIGIN: "https://content-deployer.bubblenews.today",
      CONTENT_DEPLOY_CALLBACK_URL:
        "https://content-deployer.bubblenews.today/internal/callback",
      CONTENT_BUILD_API_SECRET: "c".repeat(32),
      CONTENT_DEPLOY_CALLBACK_SECRET: "d".repeat(32),
      CLOUDFLARE_ACCOUNT_ID: "e".repeat(32),
      CLOUDFLARE_PREVIEW_API_TOKEN: "f".repeat(32),
      CLOUDFLARE_R2_LOCK_READ_TOKEN: "i".repeat(32),
      R2_ARTIFACT_ACCESS_KEY_ID: "g".repeat(24),
      R2_ARTIFACT_SECRET_ACCESS_KEY: "h".repeat(32),
      DEPLOYMENT_MODE: "shadow",
    };
    expect(
      validateWorkflowEnvironment("workflow-release", environment),
    ).toEqual({
      profile: "workflow-release",
      mode: "shadow",
    });
    expect(() =>
      validateWorkflowEnvironment("workflow-release", {
        ...environment,
        DISPATCH_ID: "1".repeat(36),
      }),
    ).toThrow(/DISPATCH_ID has an invalid format/);
  });

  it("requires exact runtime-preflight identity and R2 lock credentials", () => {
    const environment = {
      EXACT_CODE_SHA: "a".repeat(40),
      CLOUDFLARE_ACCOUNT_ID: "b".repeat(32),
      CLOUDFLARE_R2_LOCK_READ_TOKEN: "c".repeat(32),
    };
    expect(
      validateWorkflowEnvironment("workflow-runtime-preflight", environment),
    ).toEqual({ profile: "workflow-runtime-preflight" });
    expect(() =>
      validateWorkflowEnvironment("workflow-runtime-preflight", {
        ...environment,
        CLOUDFLARE_R2_LOCK_READ_TOKEN: "too-short",
      }),
    ).toThrow(/CLOUDFLARE_R2_LOCK_READ_TOKEN is too short/);
  });

  it("requires an exact SHA, HTTPS origin, and dedicated code release secret", () => {
    const environment = {
      EXACT_CODE_SHA: "a".repeat(40),
      CODE_RELEASE_ORIGIN: "https://content-deployer.bubblenews.today",
      CODE_RELEASE_SECRET: "b".repeat(32),
      CONTENT_CURRENT_URLS:
        "https://content-api.example.com/v1/current,https://content-api-origin.example.com/v1/current",
      CONTENT_SITE_IDENTITY_URLS:
        "https://site.example.com/release-manifests/site-route-manifest.json,https://pages.example.com/release-manifests/site-route-manifest.json",
      CODE_RELEASE_SITE_PROBES_PER_ORIGIN: "3",
      CODE_RELEASE_WAIT_TIMEOUT_SECONDS: "2700",
    };
    expect(
      validateWorkflowEnvironment("workflow-code-release", environment),
    ).toEqual({ profile: "workflow-code-release" });
    expect(() =>
      validateWorkflowEnvironment("workflow-code-release", {
        ...environment,
        CODE_RELEASE_ORIGIN: "http://content-deployer.example.com",
      }),
    ).toThrow(/CODE_RELEASE_ORIGIN must be a credential-free HTTPS origin/);
    expect(() =>
      validateWorkflowEnvironment("workflow-code-release", {
        ...environment,
        CONTENT_CURRENT_URLS: "https://content-api.example.com/v1/current",
      }),
    ).toThrow(/at least two verifier origins/);
    expect(() =>
      validateWorkflowEnvironment("workflow-code-release", {
        ...environment,
        CONTENT_CURRENT_URLS:
          "https://content-api.example.com/v1/current,https://content-api.example.com/v1/current",
      }),
    ).toThrow(/distinct verifier origins/);
    expect(() =>
      validateWorkflowEnvironment("workflow-code-release", {
        ...environment,
        CONTENT_CURRENT_URLS:
          "https://content-api.example.com/v1/current?cached=true,https://content-api-origin.example.com/v1/current",
      }),
    ).toThrow(/exact \/v1\/current endpoints/);
    expect(() =>
      validateWorkflowEnvironment("workflow-code-release", {
        ...environment,
        CONTENT_SITE_IDENTITY_URLS:
          "https://site.example.com/manifest.json,https://pages.example.com/release-manifests/site-route-manifest.json",
      }),
    ).toThrow(/exact \/release-manifests\/site-route-manifest\.json endpoints/);
    expect(() =>
      validateWorkflowEnvironment("workflow-code-release", {
        ...environment,
        CODE_RELEASE_SITE_PROBES_PER_ORIGIN: "1",
      }),
    ).toThrow(/must be between 2 and 5/);
  });

  it("requires a topology-approved deployer-only observability environment", () => {
    const environment = {
      CONTENT_OBSERVABILITY_DATABASE_URL:
        "postgresql://content_deployer.abcdefghijklmnopqrst:secret@aws-0-us-east-1.pooler.supabase.com/postgres",
      CONTENT_DATABASE_PROJECT_REF: "abcdefghijklmnopqrst",
      CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
      CLOUDFLARE_ZONE_ID: "b".repeat(32),
      CLOUDFLARE_ANALYTICS_API_TOKEN: "c".repeat(32),
      CONTENT_SCHEDULE_HEALTH_TOKEN: "d".repeat(32),
      CONTENT_SCHEDULE_HEALTH_URL:
        "https://ai-daily.example.workers.dev/health/scheduled",
      CONTENT_CURRENT_URLS:
        "https://content-api.example.com/v1/current,https://content-api-alt.example.com/v1/current",
      CONTENT_STATIC_MANIFEST_URLS:
        "https://example.com/release-manifests/site-route-manifest.json,https://www.example.net/release-manifests/site-route-manifest.json",
      CONTENT_API_CACHE_HIT_MINIMUM: "0.5",
      CONTENT_API_CACHE_SAMPLE_MINIMUM: "100",
      CONTENT_OBSERVABILITY_STARTED_AT: "2026-07-18T15:00:00.000Z",
    };
    expect(
      validateWorkflowEnvironment("workflow-observability", environment),
    ).toEqual({
      profile: "workflow-observability",
      projectRef: "abcdefghijklmnopqrst",
      startedAt: "2026-07-18T15:00:00.000Z",
    });
    expect(() =>
      validateWorkflowEnvironment("workflow-observability", {
        ...environment,
        CONTENT_OBSERVABILITY_DATABASE_URL:
          "postgresql://postgres.abcdefghijklmnopqrst:secret@aws-0-us-east-1.pooler.supabase.com/postgres",
      }),
    ).toThrow(/must use content_deployer/);
  });

  it("requires a topology-approved deployer and locked archive credentials for the two-day gate", () => {
    const environment = {
      CONTENT_OBSERVABILITY_DATABASE_URL:
        "postgresql://content_deployer.abcdefghijklmnopqrst:secret@aws-0-us-east-1.pooler.supabase.com/postgres",
      CONTENT_DATABASE_PROJECT_REF: "abcdefghijklmnopqrst",
      CONTENT_OBSERVATION_START_DATE: "2026-07-17",
      CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
      CLOUDFLARE_R2_LOCK_READ_TOKEN: "b".repeat(32),
      AWS_ACCESS_KEY_ID: "c".repeat(24),
      AWS_SECRET_ACCESS_KEY: "d".repeat(32),
    };
    expect(
      validateWorkflowEnvironment("workflow-observation-window", environment),
    ).toEqual({
      profile: "workflow-observation-window",
      projectRef: "abcdefghijklmnopqrst",
      startDate: "2026-07-17",
    });
    expect(() =>
      validateWorkflowEnvironment("workflow-observation-window", {
        ...environment,
        CONTENT_OBSERVATION_START_DATE: "2026-02-30",
      }),
    ).toThrow(/not a real date/);
  });

  it("requires the recovery monitor to report through a dedicated exact callback", () => {
    const environment = {
      CONTENT_DATABASE_PROJECT_REF: "abcdefghijklmnopqrst",
      CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
      SUPABASE_MANAGEMENT_API_TOKEN: "b".repeat(32),
      AWS_ACCESS_KEY_ID: "c".repeat(24),
      AWS_SECRET_ACCESS_KEY: "d".repeat(32),
      CONTENT_RECOVERY_CALLBACK_URL:
        "https://content-deployer.bubblenews.today/internal/recovery-health",
      CONTENT_RECOVERY_CALLBACK_SECRET: "e".repeat(32),
    };
    expect(
      validateWorkflowEnvironment("workflow-recovery-monitor", environment),
    ).toEqual({
      profile: "workflow-recovery-monitor",
      projectRef: "abcdefghijklmnopqrst",
    });
    expect(() =>
      validateWorkflowEnvironment("workflow-recovery-monitor", {
        ...environment,
        CONTENT_RECOVERY_CALLBACK_URL:
          "https://content-deployer.bubblenews.today/callbacks/github",
      }),
    ).toThrow(/exact \/internal\/recovery-health endpoint/);
  });
});

describe("Supabase migration writer compatibility", () => {
  it("does not reset the CLI outer role after SET LOCAL ROLE migrations", () => {
    const migrations = [
      "20260717000600_content_admin_read_authorization.sql",
      "20260717000700_content_recovery_dashboard.sql",
      "20260717000800_content_ed25519_attestation.sql",
      "20260717000900_content_publish_control_boundary.sql",
      "20260717001000_content_observability.sql",
      "20260717001100_content_observation_evidence.sql",
    ];
    for (const migration of migrations) {
      const sql = readFileSync(`supabase/migrations/${migration}`, "utf8");
      expect(sql).toMatch(/^set local role content_rpc_owner;/m);
      expect(sql).not.toMatch(/^reset role;/m);
    }
  });
});

describe("R2 lock assertion", () => {
  const envelope = (rules) => ({ success: true, result: { rules } });

  it("accepts an enabled covering age rule at the retention floor", () => {
    const result = assertR2Lock(
      envelope([
        {
          id: "database-30d",
          enabled: true,
          prefix: "database/",
          condition: { type: "Age", maxAgeSeconds: 30 * 86400 },
        },
      ]),
      "database/2026/07/17/hash.dump.age",
      30 * 86400,
      Date.UTC(2026, 6, 17),
    );
    expect(result.rule_id).toBe("database-30d");
    expect(result.verified).toBe(true);
  });

  it("rejects disabled, short, or non-covering rules", () => {
    expect(() =>
      assertR2Lock(
        envelope([
          {
            id: "wrong-prefix",
            enabled: true,
            prefix: "other/",
            condition: { type: "Indefinite" },
          },
          {
            id: "too-short",
            enabled: true,
            prefix: "database/",
            condition: { type: "Age", maxAgeSeconds: 29 * 86400 },
          },
        ]),
        "database/object",
        30 * 86400,
      ),
    ).toThrow(/no enabled R2 lock rule/);
  });

  it("requires an indefinite rule for published artifact paths", () => {
    const ageRule = envelope([
      {
        id: "artifact-ten-years",
        enabled: true,
        prefix: "assets/",
        condition: { type: "Age", maxAgeSeconds: 10 * 365 * 86400 },
      },
    ]);
    expect(() =>
      assertR2Lock(
        ageRule,
        "assets/sha256/hash",
        1,
        Date.UTC(2026, 6, 17),
        true,
      ),
    ).toThrow(/no enabled indefinite R2 lock rule/);
    const indefinite = assertR2Lock(
      envelope([
        {
          id: "artifact-indefinite",
          enabled: true,
          prefix: "assets/",
          condition: { type: "Indefinite" },
        },
      ]),
      "assets/sha256/hash",
      1,
      Date.UTC(2026, 6, 17),
      true,
    );
    expect(indefinite.required_condition).toBe("Indefinite");
  });
});

describe("content recovery health", () => {
  it("accepts enabled PITR and a backup within the one-hour RPO", () => {
    const now = Date.UTC(2026, 6, 17, 12, 0, 0);
    const result = assertContentRecoveryHealth(
      { pitr_enabled: true },
      {
        Contents: [
          {
            Key: "database/2026/07/17/hash.dump.age",
            LastModified: new Date(now - 59 * 60 * 1000).toISOString(),
          },
        ],
      },
      3600,
      now,
    );
    expect(result.healthy).toBe(true);
    expect(result.latest_backup_age_seconds).toBe(3540);
  });

  it("fails when PITR is disabled or the backup exceeds RPO", () => {
    const now = Date.UTC(2026, 6, 17, 12, 0, 0);
    const listing = {
      Contents: [
        {
          Key: "database/old.dump.age",
          LastModified: new Date(now - 3601 * 1000).toISOString(),
        },
      ],
    };
    expect(() =>
      assertContentRecoveryHealth({ pitr_enabled: false }, listing, 3600, now),
    ).toThrow(/PITR is not enabled/);
    expect(() =>
      assertContentRecoveryHealth({ pitr_enabled: true }, listing, 3600, now),
    ).toThrow(/3601 seconds old/);
  });
});

describe("Ed25519 attestation key rotation", () => {
  it("requires a matching project topology, a new key ID and an explicit reason", () => {
    const environment = {
      CONTENT_DATABASE_ADMIN_URL:
        "postgresql://postgres.abcdefghijklmnopqrst:secret@aws-0-us-east-1.pooler.supabase.com/postgres",
      CONTENT_DATABASE_PROJECT_REF: "abcdefghijklmnopqrst",
      ATTESTATION_ED25519_NEW_KEY_ID: "content-attestation-v2",
      ATTESTATION_ED25519_NEW_PUBLIC_KEY: "a".repeat(43),
      ATTESTATION_ED25519_RETIRE_KEY_ID: "content-attestation-v1",
      CONTENT_OWNER_ACCESS_SUB: "owner|subject",
      CONTENT_ATTESTATION_ROTATION_REASON: "scheduled key rotation",
    };
    expect(validateAttestationRotationEnvironment(environment)).toMatchObject({
      newKeyId: "content-attestation-v2",
      retireKeyId: "content-attestation-v1",
      projectRef: "abcdefghijklmnopqrst",
    });
    expect(() =>
      validateAttestationRotationEnvironment({
        ...environment,
        CONTENT_DATABASE_ADMIN_URL:
          "postgresql://postgres.znurdobjryrhshzkalup:secret@aws-0-us-east-1.pooler.supabase.com/postgres",
        CONTENT_DATABASE_PROJECT_REF: "znurdobjryrhshzkalup",
      }),
    ).toThrow(/shared Supabase project/);
    expect(
      validateAttestationRotationEnvironment({
        ...environment,
        CONTENT_DATABASE_ADMIN_URL:
          "postgresql://postgres.znurdobjryrhshzkalup:secret@aws-0-us-east-1.pooler.supabase.com/postgres",
        CONTENT_DATABASE_PROJECT_REF: "znurdobjryrhshzkalup",
        CONTENT_DATABASE_TOPOLOGY: "shared_project",
        CONTENT_SHARED_PROJECT_ACK: SHARED_CONTENT_PROJECT_ACK,
      }),
    ).toMatchObject({
      projectRef: "znurdobjryrhshzkalup",
      topology: "shared_project",
    });
  });
});
