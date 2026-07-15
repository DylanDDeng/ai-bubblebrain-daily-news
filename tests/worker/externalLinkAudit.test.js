import { describe, expect, it } from "vitest";
import {
  applyExternalLinkWaivers,
  assertPublicHttpUrl,
  auditExternalLinks,
  classifyExternalError,
  classifyExternalStatus,
  createPinnedLookup,
  evaluateExternalLinkAudit,
  isPublicIpAddress,
  probeExternalUrl,
} from "../../scripts/external-link-audit.mjs";

describe("external link audit", () => {
  it.each([
    [200, "success"],
    [301, "success"],
    [403, "reachable-restricted"],
    [404, "confirmed-dead"],
    [410, "confirmed-dead"],
    [503, "transient-upstream"],
  ])("classifies HTTP %s as %s", (status, outcome) => {
    expect(classifyExternalStatus(status).outcome).toBe(outcome);
  });

  it("rejects local and non-HTTP targets before fetching", () => {
    expect(() => assertPublicHttpUrl("http://127.0.0.1/admin")).toThrow();
    expect(() =>
      assertPublicHttpUrl("http://169.254.169.254/latest"),
    ).toThrow();
    expect(() =>
      assertPublicHttpUrl("https://service.internal/data"),
    ).toThrow();
    expect(() => assertPublicHttpUrl("file:///etc/passwd")).toThrow();
    expect(assertPublicHttpUrl("https://example.com/path").href).toBe(
      "https://example.com/path",
    );
    expect(isPublicIpAddress("8.8.8.8")).toBe(true);
    expect(isPublicIpAddress("10.0.0.1")).toBe(false);
    expect(isPublicIpAddress("::1")).toBe(false);
    expect(
      assertPublicHttpUrl("https://[2606:4700:4700::1111]/").hostname,
    ).toBe("[2606:4700:4700::1111]");
    expect(() => assertPublicHttpUrl("https://[::1]/admin")).toThrow();
    expect(() => assertPublicHttpUrl("https://[fec0::1]/admin")).toThrow();
  });

  it("rejects DNS names that resolve to IPv6 site-local space", async () => {
    let fetched = false;
    const result = await probeExternalUrl("https://internal.example/data", {
      fetchImpl: async () => {
        fetched = true;
        return new Response(null, { status: 200 });
      },
      dnsCache: new Map([
        ["internal.example", [{ address: "fec0::1", family: 6 }]],
      ]),
    });
    expect(result.outcome).toBe("policy-failure");
    expect(result.reason).toBe("blocked_resolution");
    expect(fetched).toBe(false);
  });

  it.each([
    "CERT_REVOKED",
    "CRL_HAS_EXPIRED",
    "ERR_SSL_PROTOCOL_ERROR",
    "ERR_SSL_WRONG_VERSION_NUMBER",
    "INVALID_CA",
    "UNABLE_TO_GET_CRL",
    "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
    "ERR_TLS_CERT_ALTNAME_INVALID",
  ])("treats deterministic TLS error %s as a policy failure", (code) => {
    const error = Object.assign(new Error(code), { code });
    expect(classifyExternalError(error)).toEqual({
      outcome: "policy-failure",
      reason: code,
    });
  });

  it("pins every validated DNS address while honoring family requests", async () => {
    const addresses = [
      { address: "2606:4700:4700::1111", family: 6 },
      { address: "1.1.1.1", family: 4 },
    ];
    const pinnedLookup = createPinnedLookup(addresses);
    const lookupResult = (options) =>
      new Promise((resolve, reject) => {
        pinnedLookup("example.com", options, (error, address, family) => {
          if (error) reject(error);
          else resolve({ address, family });
        });
      });
    await expect(lookupResult({ all: true })).resolves.toEqual({
      address: addresses,
      family: undefined,
    });
    await expect(lookupResult({ family: 4 })).resolves.toEqual({
      address: "1.1.1.1",
      family: 4,
    });
  });

  it("uses GET to disprove a HEAD-only 404", async () => {
    const statuses = [404, 200];
    const result = await probeExternalUrl("https://example.com/story", {
      fetchImpl: async () => new Response(null, { status: statuses.shift() }),
      dnsCache: new Map([
        ["example.com", [{ address: "93.184.216.34", family: 4 }]],
      ]),
    });
    expect(result.outcome).toBe("success");
    expect(result.methods).toEqual([
      { method: "HEAD", status: 404 },
      { method: "GET", status: 200 },
    ]);
  });

  it("probes a public IPv6 literal without attempting DNS lookup", async () => {
    const result = await probeExternalUrl(
      "https://[2606:4700:4700::1111]/dns-query",
      {
        fetchImpl: async () => new Response(null, { status: 200 }),
      },
    );
    expect(result.outcome).toBe("success");
    expect(result.error_code).toBeUndefined();
  });

  it("requires GET confirmation before declaring a URL dead", async () => {
    const result = await probeExternalUrl("https://example.com/missing", {
      fetchImpl: async () => new Response(null, { status: 404 }),
      dnsCache: new Map([
        ["example.com", [{ address: "93.184.216.34", family: 4 }]],
      ]),
    });
    expect(result.outcome).toBe("confirmed-dead");
    expect(result.methods).toEqual([
      { method: "HEAD", status: 404 },
      { method: "GET", status: 404 },
    ]);
  });

  it("rejects redirects to private network targets", async () => {
    const result = await probeExternalUrl("https://example.com/redirect", {
      fetchImpl: async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://127.0.0.1/admin" },
        }),
      dnsCache: new Map([
        ["example.com", [{ address: "93.184.216.34", family: 4 }]],
      ]),
    });
    expect(result.outcome).toBe("policy-failure");
    expect(result.reason).toBe("blocked_ip");
  });

  it("opens an origin circuit only after three direct transient results", async () => {
    const urls = Array.from(
      { length: 5 },
      (_, index) => `https://slow.example/${index}`,
    );
    const audit = await auditExternalLinks(urls, {
      probe: async (url) => ({
        url,
        outcome: "transport-unknown",
        reason: "ETIMEDOUT",
        directly_probed: true,
      }),
      originConcurrency: 1,
    });
    expect(audit.results.map((result) => result.outcome)).toEqual([
      "transport-unknown",
      "transport-unknown",
      "transport-unknown",
      "circuit-open",
      "circuit-open",
    ]);
    expect(audit.circuits).toHaveLength(1);
    expect(evaluateExternalLinkAudit(audit).gate).toBe("INCONCLUSIVE");
  });

  it("keeps confirmed dead URLs as hard failures without opening a circuit", async () => {
    const audit = await auditExternalLinks(
      ["https://mixed.example/a", "https://mixed.example/b"],
      {
        probe: async (url) => ({
          url,
          outcome: url.endsWith("/a") ? "success" : "confirmed-dead",
          reason: url.endsWith("/a") ? "http_success" : "http_404",
          directly_probed: true,
        }),
        originConcurrency: 1,
      },
    );
    const evaluation = evaluateExternalLinkAudit(audit, {
      min_direct_coverage_ratio: 1,
      min_success_ratio: 0,
      max_transport_unknown_ratio: 0,
      max_transient_upstream_ratio: 0,
      max_circuit_open_ratio: 0,
      max_incomplete: 0,
    });
    expect(audit.circuits).toEqual([]);
    expect(evaluation.gate).toBe("FAIL");
  });

  it("accepts an active exact-URL waiver without hiding its evidence", () => {
    const audit = applyExternalLinkWaivers(
      {
        results: [
          {
            url: "https://example.com/live",
            outcome: "success",
            reason: "http_success",
            directly_probed: true,
          },
          {
            url: "https://example.com/deleted",
            outcome: "confirmed-dead",
            reason: "http_404",
            directly_probed: true,
          },
        ],
      },
      {
        schema_version: 1,
        url_waivers: [
          {
            url: "https://example.com/deleted",
            outcomes: ["confirmed-dead"],
            reason: "Historical source was deleted upstream.",
            owner: "release-owner",
            expires_on: "2026-08-01",
          },
        ],
        origin_waivers: [],
      },
      new Date("2026-07-15T00:00:00Z"),
    );
    const evaluation = evaluateExternalLinkAudit(audit);
    expect(evaluation.gate).toBe("PASS");
    expect(evaluation.waived).toBe(1);
    expect(evaluation.evaluated_total).toBe(1);
    expect(audit.results[1].waiver).toMatchObject({
      kind: "url",
      owner: "release-owner",
      expires_on: "2026-08-01",
    });
  });

  it("excludes only capped transient origin outcomes from budgets", () => {
    const results = [
      {
        url: "https://healthy.example/live",
        outcome: "success",
        reason: "http_success",
        directly_probed: true,
      },
      ...Array.from({ length: 3 }, (_, index) => ({
        url: `https://blocked.example/${index}`,
        outcome: index === 0 ? "transport-unknown" : "circuit-open",
        reason: index === 0 ? "ETIMEDOUT" : "origin_transport_circuit",
        directly_probed: index === 0,
      })),
    ];
    const audit = applyExternalLinkWaivers(
      { results },
      {
        schema_version: 1,
        url_waivers: [],
        origin_waivers: [
          {
            origin: "https://blocked.example",
            outcomes: ["transport-unknown", "circuit-open"],
            max_urls: 3,
            reason: "Origin blocks the audit egress.",
            owner: "release-owner",
            expires_on: "2026-08-01",
          },
        ],
      },
      new Date("2026-07-15T00:00:00Z"),
    );
    const evaluation = evaluateExternalLinkAudit(audit);
    expect(evaluation.gate).toBe("PASS");
    expect(evaluation.waived).toBe(3);
    expect(evaluation.direct_coverage_ratio).toBe(1);
  });

  it("fails closed when an origin waiver cap is exceeded", () => {
    const audit = applyExternalLinkWaivers(
      {
        results: [
          {
            url: "https://healthy.example/live",
            outcome: "success",
            reason: "http_success",
            directly_probed: true,
          },
          ...Array.from({ length: 3 }, (_, index) => ({
            url: `https://blocked.example/${index}`,
            outcome: "circuit-open",
            reason: "origin_transport_circuit",
            directly_probed: false,
          })),
        ],
      },
      {
        schema_version: 1,
        url_waivers: [],
        origin_waivers: [
          {
            origin: "https://blocked.example",
            outcomes: ["circuit-open"],
            max_urls: 2,
            reason: "Origin blocks the audit egress.",
            owner: "release-owner",
            expires_on: "2026-08-01",
          },
        ],
      },
      new Date("2026-07-15T00:00:00Z"),
    );
    const evaluation = evaluateExternalLinkAudit(audit);
    expect(evaluation.gate).toBe("INCONCLUSIVE");
    expect(evaluation.waived).toBe(0);
    expect(evaluation.violations).toContain(
      "Origin waiver cap exceeded for https://blocked.example: 3 > 2",
    );
  });

  it("does not apply expired waivers", () => {
    const audit = applyExternalLinkWaivers(
      {
        results: [
          {
            url: "https://example.com/deleted",
            outcome: "confirmed-dead",
            reason: "http_404",
            directly_probed: true,
          },
        ],
      },
      {
        schema_version: 1,
        url_waivers: [
          {
            url: "https://example.com/deleted",
            outcomes: ["confirmed-dead"],
            reason: "Historical source was deleted upstream.",
            owner: "release-owner",
            expires_on: "2026-07-14",
          },
        ],
        origin_waivers: [],
      },
      new Date("2026-07-15T00:00:00Z"),
    );
    const evaluation = evaluateExternalLinkAudit(audit);
    expect(evaluation.gate).toBe("FAIL");
    expect(evaluation.waived).toBe(0);
    expect(evaluation.violations[0]).toContain("waiver expired");
  });

  it("never passes when waivers leave no successful evaluation evidence", () => {
    const audit = {
      results: [
        {
          url: "https://blocked.example/one",
          outcome: "circuit-open",
          reason: "origin_transport_circuit",
          directly_probed: false,
          waiver: { kind: "origin" },
        },
      ],
    };
    const evaluation = evaluateExternalLinkAudit(audit);
    expect(evaluation.gate).toBe("INCONCLUSIVE");
    expect(evaluation.violations).toContain(
      "no unwaived URLs remain for evaluation",
    );
    expect(evaluation.violations).toContain("no unwaived successful URLs");
  });
});
