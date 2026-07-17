import { readBoundedJsonObject, RequestBodyError } from "../../shared/request";

export interface AdminEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ADMIN_EMAILS: string;
  ADMIN_ORIGIN: string;
  CF_ACCESS_TEAM_DOMAIN: string;
  CF_ACCESS_AUD: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACCESS_JWKS_TTL_MS = 5 * 60 * 1000;

interface AccessClaims {
  aud?: unknown;
  email?: unknown;
  exp?: unknown;
  iss?: unknown;
  nbf?: unknown;
}

interface CachedJwks {
  expiresAt: number;
  keys: JsonWebKey[];
}

const accessJwksCache = new Map<string, CachedJwks>();

export function clearAccessJwksCacheForTests(): void {
  accessJwksCache.clear();
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid JWT encoding");
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJwtJson(value: string): Record<string, unknown> {
  const decoded = new TextDecoder("utf-8", { fatal: true }).decode(
    decodeBase64Url(value),
  );
  const parsed: unknown = JSON.parse(decoded);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Invalid JWT object");
  return parsed as Record<string, unknown>;
}

function accessIssuer(env: AdminEnv): string {
  if (!env.CF_ACCESS_TEAM_DOMAIN?.trim() || !env.CF_ACCESS_AUD?.trim())
    throw new Error("Cloudflare Access configuration is missing");
  const url = new URL(env.CF_ACCESS_TEAM_DOMAIN);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash ||
    !url.hostname.endsWith(".cloudflareaccess.com")
  ) {
    throw new Error("Cloudflare Access team domain is invalid");
  }
  return url.origin;
}

async function loadAccessJwks(
  issuer: string,
  forceRefresh = false,
): Promise<JsonWebKey[]> {
  const cached = accessJwksCache.get(issuer);
  if (!forceRefresh && cached && cached.expiresAt > Date.now())
    return cached.keys;
  const response = await fetch(`${issuer}/cdn-cgi/access/certs`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("Cloudflare Access keys are unavailable");
  const payload = (await response.json()) as { keys?: unknown };
  if (!Array.isArray(payload.keys))
    throw new Error("Cloudflare Access keys are malformed");
  const keys = payload.keys.filter(
    (key): key is JsonWebKey =>
      Boolean(key) && typeof key === "object" && !Array.isArray(key),
  );
  if (!keys.length) throw new Error("Cloudflare Access keys are empty");
  accessJwksCache.set(issuer, {
    expiresAt: Date.now() + ACCESS_JWKS_TTL_MS,
    keys,
  });
  return keys;
}

function audienceMatches(value: unknown, expected: string): boolean {
  if (typeof value === "string") return value === expected;
  return Array.isArray(value) && value.some((entry) => entry === expected);
}

async function verifyAccessJwt(
  token: string,
  env: AdminEnv,
): Promise<AccessClaims> {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !part))
    throw new Error("Invalid Access JWT");
  const header = decodeJwtJson(parts[0]);
  const claims = decodeJwtJson(parts[1]) as AccessClaims;
  if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) {
    throw new Error("Unsupported Access JWT");
  }

  const issuer = accessIssuer(env);
  let keys = await loadAccessJwks(issuer);
  let jwk = keys.find((candidate) => candidate.kid === header.kid);
  if (!jwk) {
    keys = await loadAccessJwks(issuer, true);
    jwk = keys.find((candidate) => candidate.kid === header.kid);
  }
  if (
    !jwk ||
    jwk.kty !== "RSA" ||
    (jwk.alg !== undefined && jwk.alg !== "RS256") ||
    (jwk.use !== undefined && jwk.use !== "sig")
  ) {
    throw new Error("Access signing key is invalid");
  }
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    decodeBase64Url(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!verified) throw new Error("Access JWT signature is invalid");

  const now = Math.floor(Date.now() / 1000);
  if (
    claims.iss !== issuer ||
    !audienceMatches(claims.aud, env.CF_ACCESS_AUD.trim()) ||
    typeof claims.exp !== "number" ||
    !Number.isSafeInteger(claims.exp) ||
    claims.exp <= now ||
    (claims.nbf !== undefined &&
      (typeof claims.nbf !== "number" ||
        !Number.isSafeInteger(claims.nbf) ||
        claims.nbf > now))
  ) {
    throw new Error("Access JWT claims are invalid");
  }
  return claims;
}

function securityHeaders(nonce?: string): Headers {
  const headers = new Headers({
    "Cache-Control": "no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  });
  if (nonce) {
    headers.set(
      "Content-Security-Policy",
      `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; img-src https: data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`,
    );
  }
  return headers;
}

function json(body: unknown, status = 200): Response {
  const headers = securityHeaders();
  const value = JSON.stringify(body);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(value, { status, headers });
}

async function adminEmail(
  request: Request,
  env: AdminEnv,
): Promise<string | null> {
  const token = request.headers.get("Cf-Access-Jwt-Assertion")?.trim();
  if (!token) return null;
  let claims: AccessClaims;
  try {
    claims = await verifyAccessJwt(token, env);
  } catch {
    return null;
  }
  const email =
    typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  if (!email) return null;
  const allowed = new Set(
    String(env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  return allowed.has(email) ? email : null;
}

function mutationOriginAllowed(request: Request, env: AdminEnv): boolean {
  return request.headers.get("Origin") === env.ADMIN_ORIGIN;
}

async function supabase(
  env: AdminEnv,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("apikey", env.SUPABASE_SERVICE_ROLE_KEY);
  headers.set("Authorization", `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`);
  if (init.body) headers.set("Content-Type", "application/json");
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { ...init, headers });
}

async function rpc(
  env: AdminEnv,
  name: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const response = await supabase(env, `rpc/${name}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(
      detail?.message ?? `Database request failed (${response.status})`,
    );
  }
  return response.status === 204 ? null : response.json();
}

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes));
}

function adminPage(email: string): Response {
  const nonce = randomNonce();
  const headers = securityHeaders(nonce);
  headers.set("Content-Type", "text/html; charset=utf-8");
  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>社区审核 · Bubble's Brain</title>
<style nonce="${nonce}">
:root{color-scheme:light;--paper:#f4f1e9;--raised:#faf8f2;--ink:#20201e;--soft:#5c5a55;--rule:#d3cec2;--blue:#254f99;--red:#b34135;font-family:"PingFang SC","Hiragino Sans GB",sans-serif}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink)}header{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;gap:2rem;padding:1.25rem clamp(1rem,4vw,3.5rem);border-bottom:1px solid var(--rule);background:color-mix(in srgb,var(--paper) 94%,transparent);backdrop-filter:blur(12px)}h1{margin:0;font-family:"Songti SC",serif;font-size:1.35rem}header p{margin:.2rem 0 0;color:var(--soft);font-size:.78rem}main{width:min(1120px,calc(100% - 2rem));margin:0 auto;padding:clamp(2rem,6vw,5rem) 0}.toolbar{display:flex;flex-wrap:wrap;align-items:end;justify-content:space-between;gap:1rem;padding-bottom:1.5rem;border-bottom:1px solid var(--rule)}label{display:grid;gap:.4rem;color:var(--soft);font-size:.78rem}select,button,input{min-height:44px;border:1px solid var(--rule);background:var(--raised);color:var(--ink);font:inherit}select,input{padding:.55rem .75rem}button{padding:.55rem .9rem;cursor:pointer}button[data-danger]{color:var(--red)}button:disabled{opacity:.55;cursor:wait}.status{min-height:1.5rem;margin:1rem 0;color:var(--soft)}ol{list-style:none;margin:0;padding:0}article{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:1.5rem;padding:1.35rem 0;border-bottom:1px solid var(--rule)}article h2{margin:0;font-size:.9rem;font-weight:600}article p{margin:.6rem 0;white-space:pre-wrap;overflow-wrap:anywhere}article small{color:var(--soft)}.actions{display:flex;align-items:start;gap:.5rem}.empty{padding:4rem 0;color:var(--soft)}@media(max-width:680px){article{grid-template-columns:1fr}.actions{justify-content:flex-start}}
</style></head><body>
<header><div><h1>社区审核</h1><p>评论、开关与归档边界</p></div><p>${email.replace(/[<>&"']/g, "")}</p></header>
<main><section class="toolbar" aria-label="审核筛选"><label>状态<select data-filter><option value="all">全部</option><option value="visible">公开</option><option value="hidden">已隐藏</option></select></label><div><button type="button" data-write-toggle>读取写入开关…</button></div></section><p class="status" data-status role="status"></p><ol data-comments></ol></main>
<script nonce="${nonce}">
const list=document.querySelector('[data-comments]');const status=document.querySelector('[data-status]');const filter=document.querySelector('[data-filter]');const toggle=document.querySelector('[data-write-toggle]');
let writeEnabled=false;const text=(node,value)=>{node.textContent=value??''};
async function api(path,init){const response=await fetch(path,{...init,headers:{'Content-Type':'application/json',...(init&&init.headers)}});if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error||'请求失败');}return response.status===204?null:response.json()}
function render(rows){list.replaceChildren();if(!rows.length){const item=document.createElement('li');item.className='empty';text(item,'没有符合条件的评论。');list.append(item);return}for(const row of rows){const item=document.createElement('li');const article=document.createElement('article');const body=document.createElement('div');const title=document.createElement('h2');text(title,(row.profiles&&row.profiles.display_name)||'匿名用户');const meta=document.createElement('small');text(meta,row.thread_id+' · '+new Date(row.created_at).toLocaleString());const content=document.createElement('p');text(content,row.content);body.append(title,meta,content);const actions=document.createElement('div');actions.className='actions';const button=document.createElement('button');button.type='button';button.dataset.danger=row.moderation_status==='visible'?'true':'';text(button,row.moderation_status==='visible'?'隐藏':'恢复');button.addEventListener('click',()=>moderate(row.id,row.moderation_status==='visible'?'hidden':'visible',button));actions.append(button);article.append(body,actions);item.append(article);list.append(item)}}
async function load(){text(status,'正在加载…');try{const data=await api('/admin/api/comments?status='+encodeURIComponent(filter.value));render(data.comments);text(status,'共 '+data.comments.length+' 条');}catch(error){text(status,error.message)}}
async function loadSettings(){try{const data=await api('/admin/api/settings');writeEnabled=data.comments_write_enabled;syncToggle()}catch(error){text(status,error.message)}}
function syncToggle(){text(toggle,writeEnabled?'关闭生产评论写入':'开启生产评论写入');toggle.dataset.danger=writeEnabled?'true':''}
async function moderate(id,next,button){button.disabled=true;try{await api('/admin/api/comments/'+id+'/moderate',{method:'POST',body:JSON.stringify({status:next,reason:next==='hidden'?'管理员审核隐藏':null})});await load()}catch(error){text(status,error.message)}finally{button.disabled=false}}
filter.addEventListener('change',load);toggle.addEventListener('click',async()=>{toggle.disabled=true;try{const data=await api('/admin/api/settings/comments-write',{method:'POST',body:JSON.stringify({enabled:!writeEnabled})});writeEnabled=data.enabled;syncToggle();text(status,writeEnabled?'评论写入已开启。':'评论写入已关闭。')}catch(error){text(status,error.message)}finally{toggle.disabled=false}});load();loadSettings();
</script></body></html>`;
  return new Response(html, { headers });
}

async function handleApi(request: Request, env: AdminEnv): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/admin/api/comments") {
    const status = url.searchParams.get("status");
    const statusFilter =
      status === "visible" || status === "hidden"
        ? `&moderation_status=eq.${status}`
        : "";
    const response = await supabase(
      env,
      `comments?select=id,thread_id,parent_id,user_id,type,content,created_at,moderation_status,moderation_reason,profiles(display_name,avatar_url)&thread_id=like.page:/*${statusFilter}&order=created_at.desc&limit=200`,
    );
    if (!response.ok)
      return json({ error: "Comments could not be loaded" }, 502);
    return json({ comments: await response.json() });
  }
  if (request.method === "GET" && url.pathname === "/admin/api/settings") {
    const settings = (await rpc(
      env,
      "admin_get_community_settings",
      {},
    )) as unknown[];
    return json(
      Array.isArray(settings) && settings[0]
        ? settings[0]
        : { comments_write_enabled: false },
    );
  }
  if (request.method !== "GET" && !mutationOriginAllowed(request, env))
    return json({ error: "Invalid origin" }, 403);

  const moderate = url.pathname.match(
    /^\/admin\/api\/comments\/([0-9a-f-]+)\/moderate$/i,
  );
  if (request.method === "POST" && moderate && UUID_PATTERN.test(moderate[1])) {
    const body = (await readBoundedJsonObject(request, {
      maxBytes: 4_096,
      allowedFields: ["status", "reason"],
    })) as {
      status?: unknown;
      reason?: unknown;
    };
    if (body.status !== "visible" && body.status !== "hidden")
      return json({ error: "Invalid moderation status" }, 400);
    if (
      body.reason != null &&
      (typeof body.reason !== "string" || body.reason.length > 500)
    )
      return json({ error: "Invalid reason" }, 400);
    await rpc(env, "admin_moderate_comment", {
      p_comment_id: moderate[1],
      p_status: body.status,
      p_reason: body.reason ?? null,
    });
    return json({ ok: true });
  }
  if (
    request.method === "POST" &&
    url.pathname === "/admin/api/settings/comments-write"
  ) {
    const body = (await readBoundedJsonObject(request, {
      maxBytes: 1_024,
      allowedFields: ["enabled"],
    })) as { enabled?: unknown };
    if (typeof body.enabled !== "boolean")
      return json({ error: "enabled must be boolean" }, 400);
    const enabled = await rpc(env, "admin_set_comment_writes", {
      p_enabled: body.enabled,
    });
    return json({ enabled });
  }
  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(request: Request, env: AdminEnv): Promise<Response> {
    const email = await adminEmail(request, env);
    if (!email)
      return json({ error: "Cloudflare Access authentication required" }, 401);
    const url = new URL(request.url);
    if (url.pathname === "/")
      return Response.redirect(`${env.ADMIN_ORIGIN}/admin/`, 302);
    if (request.method === "GET" && url.pathname === "/admin/")
      return adminPage(email);
    try {
      return await handleApi(request, env);
    } catch (error) {
      if (error instanceof RequestBodyError)
        return json({ error: error.message }, error.status);
      return json({ error: "Admin service is temporarily unavailable" }, 502);
    }
  },
};
