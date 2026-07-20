import {
  escapeHtml,
  formatDateToChineseWithTime,
  getRandomUserAgent,
  isDateWithinLastDays,
  sleep,
  stripHtml,
} from "../helpers.js";
import { getFoloDataApi, getFoloErrorMessage } from "../folo.js";
import {
  assertFoloPayload,
  assertProviderPositiveIntegerSetting,
  assertProviderUrl,
  normalizeProviderFailure,
  providerConfigurationError,
  providerHttpError,
} from "../daily/providerFailure.js";

export function createFoloFeedDataSource({
  feedIdEnv,
  fetchPagesEnv,
  sourceName,
  logName = sourceName,
  homePageUrl,
  defaultFetchPages = "3",
  filterDaysEnv = "FOLO_FILTER_DAYS",
  defaultFilterDays = "3",
}) {
  return {
    fetch: async (env, foloCookie, { strict = false, signal } = {}) => {
      const feedId = env[feedIdEnv];
      const fetchPages = parseInt(env[fetchPagesEnv] || defaultFetchPages, 10);
      const filterDays = parseInt(
        env[filterDaysEnv] || defaultFilterDays,
        10,
      );
      const foloDataApi = getFoloDataApi(env);
      if (strict) {
        assertProviderPositiveIntegerSetting(
          env[fetchPagesEnv],
          defaultFetchPages,
        );
        assertProviderPositiveIntegerSetting(
          env[filterDaysEnv],
          defaultFilterDays,
        );
        assertProviderUrl(foloDataApi);
      }

      if (!feedId) {
        if (strict) throw providerConfigurationError();
        console.error(`${feedIdEnv} is not set in environment variables.`);
        return {
          version: "https://jsonfeed.org/version/1.1",
          title: `${sourceName} Daily Feeds`,
          home_page_url: homePageUrl,
          description: `Aggregated ${sourceName} daily feeds`,
          language: "zh-cn",
          items: [],
        };
      }

      const items = [];
      let publishedAfter = null;
      for (let page = 0; page < fetchPages; page += 1) {
        const headers = {
          "User-Agent": getRandomUserAgent(),
          "Content-Type": "application/json",
          accept: "application/json",
          "accept-language": "zh-CN,zh;q=0.9",
          origin: "https://app.folo.is",
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-site",
          "x-app-name": "Folo Web",
          "x-app-version": "0.4.9",
        };
        if (foloCookie) headers.Cookie = foloCookie;

        const body = { feedId, view: 1, withContent: true };
        if (publishedAfter) body.publishedAfter = publishedAfter;

        try {
          console.log(`Fetching ${logName} data, page ${page + 1}...`);
          const response = await fetch(foloDataApi, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
            signal,
          });
          if (!response.ok) {
            if (strict) throw providerHttpError(response.status);
            console.error(
              `Failed to fetch ${logName} data, page ${page + 1}: ${await getFoloErrorMessage(response)}`,
            );
            break;
          }

          const data = await response.json();
          if (strict) assertFoloPayload(data);
          if (!data?.data?.length) {
            console.log(`No more data for ${logName}, page ${page + 1}.`);
            break;
          }

          items.push(
            ...data.data
              .filter((entry) =>
                isDateWithinLastDays(entry.entries.publishedAt, filterDays),
              )
              .map((entry) => ({
                id: entry.entries.id,
                url: entry.entries.url,
                title: entry.entries.title,
                content_html: entry.entries.content,
                date_published: entry.entries.publishedAt,
                authors: [{ name: entry.entries.author }],
                source: sourceName,
              })),
          );
          publishedAfter = data.data.at(-1).entries.publishedAt;
        } catch (error) {
          if (strict) throw normalizeProviderFailure(error);
          console.error(
            `Error fetching ${logName} data, page ${page + 1}:`,
            error,
          );
          break;
        }

        if (page + 1 < fetchPages) {
          await sleep(Math.random() * 5000, { signal });
        }
      }

      return {
        version: "https://jsonfeed.org/version/1.1",
        title: `${sourceName} Daily Feeds`,
        home_page_url: homePageUrl,
        description: `Aggregated ${sourceName} daily feeds`,
        language: "zh-cn",
        items,
      };
    },

    transform: (rawData, sourceType) =>
      Array.isArray(rawData?.items)
        ? rawData.items.map((item) => ({
            id: item.id,
            type: sourceType,
            url: item.url,
            title: item.title,
            description: stripHtml(item.content_html || ""),
            published_date: item.date_published,
            authors:
              item.authors?.map((author) => author.name).join(", ") ||
              "Unknown",
            source: item.source || sourceName,
            details: { content_html: item.content_html || "" },
          }))
        : [],

    generateHtml: (item) => `
            <strong>${escapeHtml(item.title)}</strong><br>
            <small>来源: ${escapeHtml(item.source || "未知")} | 发布日期: ${formatDateToChineseWithTime(item.published_date)}</small>
            <div class="content-html">${item.details.content_html || "无内容。"}</div>
            <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">阅读更多</a>
        `,
  };
}
