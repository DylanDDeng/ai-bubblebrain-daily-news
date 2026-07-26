const DEFAULT_SITE_ORIGIN = "https://bubblenews.today";
const URL_ATTRIBUTES = new Set([
  "href",
  "src",
  "action",
  "poster",
  "data",
  "cite",
]);

function parseStartTag(tag) {
  if (!tag.startsWith("<")) return null;
  let cursor = 1;
  while (/\s/.test(tag[cursor] || "")) cursor += 1;
  const nameStart = cursor;
  while (/[^\s/>]/.test(tag[cursor] || "")) cursor += 1;
  const name = tag.slice(nameStart, cursor).toLowerCase();
  if (!name || name.startsWith("!") || name.startsWith("?")) return null;

  const attributes = new Map();
  while (cursor < tag.length) {
    while (/\s/.test(tag[cursor] || "")) cursor += 1;
    if (!tag[cursor] || tag[cursor] === ">" || tag[cursor] === "/") break;

    const attributeStart = cursor;
    while (/[^\s=/>]/.test(tag[cursor] || "")) cursor += 1;
    const attributeName = tag
      .slice(attributeStart, cursor)
      .toLowerCase();
    if (!attributeName) {
      cursor += 1;
      continue;
    }

    while (/\s/.test(tag[cursor] || "")) cursor += 1;
    let value = "";
    if (tag[cursor] === "=") {
      cursor += 1;
      while (/\s/.test(tag[cursor] || "")) cursor += 1;
      const quote = tag[cursor];
      if (quote === '"' || quote === "'") {
        cursor += 1;
        const valueStart = cursor;
        while (cursor < tag.length && tag[cursor] !== quote) cursor += 1;
        value = tag.slice(valueStart, cursor);
        if (tag[cursor] === quote) cursor += 1;
      } else {
        const valueStart = cursor;
        while (/[^\s>]/.test(tag[cursor] || "")) cursor += 1;
        value = tag.slice(valueStart, cursor);
      }
    }
    if (!attributes.has(attributeName)) attributes.set(attributeName, value);
  }
  return { name, attributes };
}

function startTags(markup) {
  const tags = [];
  let cursor = 0;
  while (cursor < markup.length) {
    const start = markup.indexOf("<", cursor);
    if (start < 0) break;
    if (markup.startsWith("<!--", start)) {
      const commentEnd = markup.indexOf("-->", start + 4);
      cursor = commentEnd < 0 ? markup.length : commentEnd + 3;
      continue;
    }
    const first = markup[start + 1];
    if (!first || !/[a-z]/i.test(first)) {
      cursor = start + 1;
      continue;
    }

    let quote = null;
    let end = start + 1;
    for (; end < markup.length; end += 1) {
      const character = markup[end];
      if (quote) {
        if (character === quote) quote = null;
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === ">") {
        tags.push(markup.slice(start, end + 1));
        end += 1;
        break;
      }
    }
    cursor = Math.max(start + 1, end);
  }
  return tags;
}

export function tagAttribute(tag, name) {
  return parseStartTag(tag)?.attributes.get(String(name).toLowerCase()) ?? null;
}

export function extractLocalReferences(
  html,
  pageRoute,
  siteOrigin = DEFAULT_SITE_ORIGIN,
) {
  const references = [];
  const add = (value) => {
    const normalized = value.trim();
    if (
      !normalized ||
      normalized.startsWith("#") ||
      /^(?:mailto|tel|data|blob|javascript):/i.test(normalized)
    )
      return;
    let url;
    try {
      url = new URL(normalized, new URL(pageRoute, siteOrigin));
    } catch {
      return;
    }
    if (url.origin === siteOrigin) references.push(url.pathname);
  };
  const markup = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<pre\b[\s\S]*?<\/pre>/gi, "")
    .replace(/<code\b[\s\S]*?<\/code>/gi, "");

  for (const tag of startTags(markup)) {
    const parsed = parseStartTag(tag);
    if (!parsed) continue;
    for (const [name, value] of parsed.attributes) {
      if (URL_ATTRIBUTES.has(name)) add(value);
      if (name === "srcset") {
        for (const candidate of value.split(","))
          add(candidate.trim().split(/\s+/, 1)[0]);
      }
    }
    if (
      parsed.name === "meta" &&
      parsed.attributes.get("http-equiv")?.toLowerCase() === "refresh"
    ) {
      const target = parsed.attributes
        .get("content")
        ?.match(/url\s*=\s*(.+)$/i)?.[1];
      if (target) add(target);
    }
  }
  return references;
}
