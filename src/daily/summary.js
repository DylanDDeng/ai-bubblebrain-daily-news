const MEDIA_PLACEHOLDER_START = /(?:\\+)?\[(?:图片|image|视频|video)\s*:/giu;
const MARKDOWN_IMAGE =
  /!\[[^\]]*\]\(\s*https?:\/\/[^\s)]+(?:\s+"[^"]*")?\s*\)/giu;
const MARKDOWN_LINK =
  /\[([^\]]+)\]\(\s*https?:\/\/[^\s)]+(?:\s+"[^"]*")?\s*\)/giu;
const RAW_URL = /https?:\/\/[^\s<>\[\]）】，。！？；：、“”‘’《》]+/giu;

/**
 * Remove transport-only media markers while respecting nested square brackets.
 * Upstream summaries are a single text field, so an unclosed marker owns the
 * remainder of that field; callers must pass one summary at a time.
 */
export function stripMediaPlaceholders(value) {
  let result = String(value || "");
  let match = MEDIA_PLACEHOLDER_START.exec(result);

  while (match) {
    let depth = 1;
    let end = result.length;
    for (
      let index = match.index + match[0].length;
      index < result.length;
      index += 1
    ) {
      if (result[index] === "[") depth += 1;
      if (result[index] !== "]") continue;
      depth -= 1;
      if (depth === 0) {
        end = index + 1;
        break;
      }
    }
    result = `${result.slice(0, match.index)} ${result.slice(end)}`;
    MEDIA_PLACEHOLDER_START.lastIndex = 0;
    match = MEDIA_PLACEHOLDER_START.exec(result);
  }

  MEDIA_PLACEHOLDER_START.lastIndex = 0;
  return result;
}

/**
 * Remove transport-only image placeholders and URL payloads from text that is
 * intended to be displayed as a summary. Identity and canonical URL fields
 * must continue to use the unmodified source values.
 */
export function sanitizeSummaryText(value) {
  return stripMediaPlaceholders(value)
    .replace(MARKDOWN_IMAGE, " ")
    .replace(MARKDOWN_LINK, "$1")
    .replace(RAW_URL, " ")
    .replace(/\s+([，。！？；：,.!?;:])/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim();
}
