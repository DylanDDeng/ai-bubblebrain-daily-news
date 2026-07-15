const IMAGE_PLACEHOLDER = /(?:\\+)?\[(?:图片|image)\s*:[^\]]*\]/giu;
const MARKDOWN_IMAGE =
  /!\[[^\]]*\]\(\s*https?:\/\/[^\s)]+(?:\s+"[^"]*")?\s*\)/giu;
const MARKDOWN_LINK =
  /\[([^\]]+)\]\(\s*https?:\/\/[^\s)]+(?:\s+"[^"]*")?\s*\)/giu;
const RAW_URL = /https?:\/\/[^\s<>\[\]）】，。！？；：、“”‘’《》]+/giu;

/**
 * Remove transport-only image placeholders and URL payloads from text that is
 * intended to be displayed as a summary. Identity and canonical URL fields
 * must continue to use the unmodified source values.
 */
export function sanitizeSummaryText(value) {
  return String(value || "")
    .replace(MARKDOWN_IMAGE, " ")
    .replace(IMAGE_PLACEHOLDER, " ")
    .replace(MARKDOWN_LINK, "$1")
    .replace(RAW_URL, " ")
    .replace(/\s+([，。！？；：,.!?;:])/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim();
}
