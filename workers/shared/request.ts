export class RequestBodyError extends Error {
  readonly status: 400 | 413 | 415;

  constructor(status: 400 | 413 | 415, message: string) {
    super(message);
    this.name = "RequestBodyError";
    this.status = status;
  }
}

interface JsonObjectOptions {
  maxBytes: number;
  allowedFields?: readonly string[];
}

function validateDeclaredLength(request: Request, maxBytes: number): void {
  const raw = request.headers.get("Content-Length");
  if (raw === null) return;
  if (!/^\d+$/.test(raw))
    throw new RequestBodyError(400, "Invalid Content-Length");
  const length = Number(raw);
  if (!Number.isSafeInteger(length))
    throw new RequestBodyError(400, "Invalid Content-Length");
  if (length > maxBytes)
    throw new RequestBodyError(413, "Request body is too large");
}

export async function readBoundedJsonObject(
  request: Request,
  { maxBytes, allowedFields }: JsonObjectOptions,
): Promise<Record<string, unknown>> {
  const mediaType = (request.headers.get("Content-Type") ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (mediaType !== "application/json")
    throw new RequestBodyError(415, "Content-Type must be application/json");
  const contentEncoding = (
    request.headers.get("Content-Encoding") ?? "identity"
  )
    .trim()
    .toLowerCase();
  if (contentEncoding !== "" && contentEncoding !== "identity")
    throw new RequestBodyError(415, "Encoded request bodies are not supported");
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1)
    throw new Error("A positive JSON body limit is required");

  validateDeclaredLength(request, maxBytes);
  if (!request.body) throw new RequestBodyError(400, "JSON body required");

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let byteLength = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel();
        throw new RequestBodyError(413, "Request body is too large");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError(400, "Malformed UTF-8 request body");
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new RequestBodyError(400, "Malformed JSON body");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new RequestBodyError(400, "JSON object required");

  const object = value as Record<string, unknown>;
  if (allowedFields) {
    const allowed = new Set(allowedFields);
    if (Object.keys(object).some((field) => !allowed.has(field)))
      throw new RequestBodyError(400, "Unexpected JSON field");
  }
  return object;
}
