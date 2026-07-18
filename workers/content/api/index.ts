import { canonicalJsonBytes, sha256Hex } from "../shared/canonical";
import { openContentDatabase, type ContentSql } from "../shared/db";

type Env = {
  CONTENT_DB?: { connectionString?: string };
  CONTENT_DATABASE_URL?: string;
  REPORT_SNAPSHOTS?: R2BucketLike;
  SITE_MANIFESTS?: R2BucketLike;
  PUBLIC_SITE_ORIGIN?: string;
};

type R2BucketLike = {
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
};
type RpcName = "current" | "manifest" | "report" | "item" | "search";
type RpcCaller = (
  name: RpcName,
  args: Record<string, unknown>,
) => Promise<Record<string, unknown> | null>;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function json(
  body: unknown,
  status: number,
  headers: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

async function immutableJson(
  body: Record<string, unknown>,
  knownHash?: string,
): Promise<Response> {
  const hash = knownHash || (await sha256Hex(canonicalJsonBytes(body)));
  return json(body, 200, {
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: `"sha256-${hash}"`,
  });
}

async function immutableObject(
  bucket: R2BucketLike | undefined,
  descriptor: Record<string, unknown>,
  keyField: string,
  hashField: string,
  lengthField: string,
): Promise<Response> {
  if (!bucket) throw new Error("Exact object binding is unavailable");
  const key = descriptor[keyField];
  const expectedHash = descriptor[hashField];
  const expectedLength = Number(descriptor[lengthField]);
  if (
    typeof key !== "string" ||
    typeof expectedHash !== "string" ||
    !Number.isSafeInteger(expectedLength)
  ) {
    throw new Error("Malformed immutable object descriptor");
  }
  const object = await bucket.get(key);
  if (!object) throw new Error("Immutable object is missing");
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (
    bytes.byteLength !== expectedLength ||
    (await sha256Hex(bytes)) !== expectedHash
  ) {
    throw new Error("Immutable object verification failed");
  }
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: `"sha256-${expectedHash}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function databaseCaller(
  env: Env,
): Promise<{ call: RpcCaller; close: () => Promise<void> }> {
  const sql = openContentDatabase(env, "content-reader");
  const call: RpcCaller = async (name, args) => {
    let rows: Record<string, unknown>[];
    if (name === "current") {
      rows = await sql<
        Record<string, unknown>[]
      >`select private.get_current_release_v1() as result`;
    } else if (name === "manifest") {
      rows = await sql<Record<string, unknown>[]>`
        select private.get_release_manifest_v1(${String(args.releaseId)}::uuid) as result
      `;
    } else if (name === "report") {
      rows = await sql<Record<string, unknown>[]>`
        select private.get_release_report_v1(${String(args.releaseId)}::uuid, ${String(args.date)}::date) as result
      `;
    } else if (name === "item") {
      rows = await sql<Record<string, unknown>[]>`
        select private.get_release_item_v1(${String(args.releaseId)}::uuid, ${String(args.itemId)}) as result
      `;
    } else {
      rows = await sql<Record<string, unknown>[]>`
        select private.search_release_v1(
          ${String(args.releaseId)}::uuid, ${String(args.query)}, ${Number(args.limit)},
          ${args.beforeDate ? String(args.beforeDate) : null}::date
        ) as result
      `;
    }
    const result = rows[0]?.result;
    return result && typeof result === "object"
      ? (result as Record<string, unknown>)
      : null;
  };
  return { call, close: () => (sql as ContentSql).end({ timeout: 2 }) };
}

export async function handleContentApiRequest(
  request: Request,
  env: Env,
  dependencies: { callRpc?: RpcCaller } = {},
): Promise<Response> {
  if (request.method !== "GET")
    return json({ error: "method_not_allowed" }, 405, { Allow: "GET" });
  const url = new URL(request.url);
  let connection: Awaited<ReturnType<typeof databaseCaller>> | null = null;
  let callRpc = dependencies.callRpc;
  const call = async (
    name: RpcName,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> => {
    if (!callRpc) {
      connection = await databaseCaller(env);
      callRpc = connection.call;
    }
    return callRpc(name, args);
  };
  try {
    if (url.pathname === "/v1/current") {
      const result = await call("current", {});
      return result
        ? json(result, 200, { "Cache-Control": "no-cache, max-age=0" })
        : json({ error: "not_found" }, 404, { "Cache-Control": "no-store" });
    }

    const manifest = url.pathname.match(/^\/v1\/releases\/([^/]+)\/manifest$/);
    if (manifest) {
      if (!UUID.test(manifest[1]))
        return json({ error: "invalid_request" }, 400);
      const result = await call("manifest", { releaseId: manifest[1] });
      if (!result) return json({ error: "not_found" }, 404);
      return immutableObject(
        env.SITE_MANIFESTS,
        result,
        "manifest_object_key",
        "manifest_sha256",
        "manifest_byte_length",
      );
    }

    const report = url.pathname.match(
      /^\/v1\/releases\/([^/]+)\/reports\/(\d{4}-\d{2}-\d{2})$/,
    );
    if (report) {
      if (!UUID.test(report[1]) || !DATE.test(report[2]))
        return json({ error: "invalid_request" }, 400);
      const result = await call("report", {
        releaseId: report[1],
        date: report[2],
      });
      if (result && url.searchParams.get("exact") === "1") {
        return immutableObject(
          env.REPORT_SNAPSHOTS,
          result,
          "object_key",
          "byte_sha256",
          "byte_length",
        );
      }
      return result
        ? immutableJson(
            result,
            typeof result.byte_sha256 === "string"
              ? result.byte_sha256
              : undefined,
          )
        : json({ error: "not_found" }, 404);
    }

    const item = url.pathname.match(
      /^\/v1\/releases\/([^/]+)\/items\/(n_[a-f0-9]{64})$/,
    );
    if (item) {
      if (!UUID.test(item[1])) return json({ error: "invalid_request" }, 400);
      const result = await call("item", {
        releaseId: item[1],
        itemId: item[2],
      });
      return result ? immutableJson(result) : json({ error: "not_found" }, 404);
    }

    const search = url.pathname.match(/^\/v1\/releases\/([^/]+)\/search$/);
    if (search) {
      const query = (url.searchParams.get("q") || "").trim();
      const limit = Number(url.searchParams.get("limit") || "20");
      const beforeDate = url.searchParams.get("before_date");
      if (
        !UUID.test(search[1]) ||
        !query ||
        query.length > 200 ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 100 ||
        (beforeDate !== null && !DATE.test(beforeDate))
      ) {
        return json({ error: "invalid_request" }, 400);
      }
      const result = await call("search", {
        releaseId: search[1],
        query,
        limit,
        beforeDate,
      });
      return result ? immutableJson(result) : json({ error: "not_found" }, 404);
    }
    return json({ error: "not_found" }, 404);
  } catch {
    return json({ error: "service_unavailable" }, 503, {
      "Cache-Control": "no-store",
    });
  } finally {
    if (connection) await connection.close();
  }
}

export async function handleContentApiFetch(
  request: Request,
  env: Env,
  dependencies: { callRpc?: RpcCaller } = {},
): Promise<Response> {
  const allowedOrigin = env.PUBLIC_SITE_ORIGIN || "https://bubblenews.today";
  const requestOrigin = request.headers.get("Origin");
  if (request.method === "OPTIONS") {
    if (requestOrigin !== allowedOrigin)
      return json({ error: "origin_not_allowed" }, 403, {
        "Cache-Control": "no-store",
      });
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Accept",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin",
      },
    });
  }
  const response = await handleContentApiRequest(request, env, dependencies);
  if (requestOrigin !== allowedOrigin) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", allowedOrigin);
  headers.append("Vary", "Origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleContentApiFetch(request, env);
  },
};
