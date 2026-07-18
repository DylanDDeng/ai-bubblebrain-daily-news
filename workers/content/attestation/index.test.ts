import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, verify } from "node:crypto";

vi.mock("../../admin/src/index", () => ({
  verifyAccessJwt: vi.fn(),
}));

import { verifyAccessJwt } from "../../admin/src/index";
import { handleAttestation } from "./index";

const TOTP_SECRET = "JBSWY3DPEHPK3PXP";
const { privateKey: attestationPrivateKey, publicKey: attestationPublicKey } =
  generateKeyPairSync("ed25519");

function decodeBase32(value: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of value)
    bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return new Uint8Array(bytes);
}

async function currentTotp(): Promise<string> {
  const counter = BigInt(Math.floor(Date.now() / 30_000));
  const message = new Uint8Array(8);
  let value = counter;
  for (let index = 7; index >= 0; index -= 1) {
    message[index] = Number(value & 255n);
    value >>= 8n;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    decodeBase32(TOTP_SECRET),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
  const offset = digest[digest.length - 1] & 15;
  const code =
    ((digest[offset] & 127) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

const env = {
  CF_ACCESS_TEAM_DOMAIN: "https://bubblebrain.cloudflareaccess.com",
  CF_ACCESS_ROUTINE_AUD: "routine-audience",
  CF_ACCESS_CONTROL_AUD: "control-audience",
  ATTESTATION_ED25519_KEY_ID: "test-key-v1",
  ATTESTATION_ED25519_PRIVATE_JWK: JSON.stringify(
    attestationPrivateKey.export({ format: "jwk" }),
  ),
  CONTROL_TOTP_SECRET: TOTP_SECRET,
};

describe("identity attestation action contract", () => {
  beforeEach(() => {
    vi.mocked(verifyAccessJwt).mockResolvedValue({
      sub: "owner-sub",
      iat: Math.floor(Date.now() / 1000),
    });
  });

  it.each(["draft.publish", "operations.retry", "operations.rebuild"])(
    "signs the Control action %s after a fresh TOTP",
    async (action) => {
      const response = await handleAttestation(
        new Request("https://attestation.internal/v1/assert", {
          method: "POST",
          headers: { "Cf-Access-Jwt-Assertion": "signed-access-token" },
          body: JSON.stringify({
            audience: "content-control",
            action,
            body_sha256: "a".repeat(64),
            totp_code: await currentTotp(),
          }),
        }),
        env,
      );
      expect(response.status).toBe(200);
      const assertion = (await response.json()) as {
        payload: string;
        signature: string;
      };
      const payload = JSON.parse(assertion.payload);
      expect(payload).toMatchObject({
        action,
        aud: "content-control",
        auth_context: "access+totp",
        sub: "owner-sub",
      });
      expect(assertion.signature).toMatch(/^[a-f0-9]{128}$/);
      expect(
        verify(
          null,
          Buffer.from(assertion.payload),
          attestationPublicKey,
          Buffer.from(assertion.signature, "hex"),
        ),
      ).toBe(true);
    },
  );

  it("refuses to sign a publish assertion for the Routine audience", async () => {
    const response = await handleAttestation(
      new Request("https://attestation.internal/v1/assert", {
        method: "POST",
        headers: { "Cf-Access-Jwt-Assertion": "signed-access-token" },
        body: JSON.stringify({
          audience: "content-routine",
          action: "draft.publish",
          body_sha256: "a".repeat(64),
        }),
      }),
      env,
    );
    expect(response.status).toBe(400);
  });

  it("rejects unregistered actions before signing", async () => {
    const response = await handleAttestation(
      new Request("https://attestation.internal/v1/assert", {
        method: "POST",
        headers: { "Cf-Access-Jwt-Assertion": "signed-access-token" },
        body: JSON.stringify({
          audience: "content-control",
          action: "operations.delete",
          body_sha256: "a".repeat(64),
          totp_code: await currentTotp(),
        }),
      }),
      env,
    );
    expect(response.status).toBe(400);
  });

  it.each([
    ["content-routine", "routine-audience"],
    ["content-control-read", "control-audience"],
  ])(
    "binds %s Admin reads to the matching Access application audience",
    async (audience, expectedAccessAudience) => {
      const requestContext = {
        route: "/v1/operations",
        arguments: { limit: 25 },
      };
      const response = await handleAttestation(
        new Request("https://attestation.internal/v1/assert", {
          method: "POST",
          headers: { "Cf-Access-Jwt-Assertion": "signed-access-token" },
          body: JSON.stringify({
            audience,
            action: "admin.read",
            body_sha256: "b".repeat(64),
            request_context: requestContext,
          }),
        }),
        env,
      );
      expect(response.status).toBe(200);
      expect(verifyAccessJwt).toHaveBeenLastCalledWith(
        "signed-access-token",
        expect.objectContaining({ CF_ACCESS_AUD: expectedAccessAudience }),
      );
      const assertion = (await response.json()) as { payload: string };
      expect(JSON.parse(assertion.payload)).toMatchObject({
        action: "admin.read",
        aud: audience,
        auth_context: "access",
        request_context: requestContext,
      });
    },
  );
});
