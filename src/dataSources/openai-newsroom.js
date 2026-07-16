// src/dataSources/openai-newsroom.js
import { getRandomUserAgent, sleep, isDateWithinLastDays, stripHtml, formatDateToChineseWithTime, escapeHtml} from '../helpers.js';
import { getFoloDataApi, getFoloErrorMessage } from '../folo.js';
import { assertFoloPayload, assertProviderPositiveIntegerSetting, assertProviderUrl, normalizeProviderFailure, providerConfigurationError, providerHttpError } from '../daily/providerFailure.js';

const NewsDataSource = {
    fetch: async (env, foloCookie, { strict = false, signal } = {}) => {
        const feedId = env.OPENAI_NEWSROOM_FEED_ID;
        const fetchPages = parseInt(env.OPENAI_NEWSROOM_FETCH_PAGES || '3', 10);
        const allItems = [];
        const filterDays = parseInt(env.FOLO_FILTER_DAYS || '3', 10);
        const foloDataApi = getFoloDataApi(env);
        if (strict) {
            assertProviderPositiveIntegerSetting(env.OPENAI_NEWSROOM_FETCH_PAGES, '2');
            assertProviderPositiveIntegerSetting(env.FOLO_FILTER_DAYS, '3');
            assertProviderUrl(foloDataApi);
        }

        if (!feedId) {
            if (strict) throw providerConfigurationError();
            console.error('OPENAI_NEWSROOM_FEED_ID is not set in environment variables.');
            return {
                version: "https://jsonfeed.org/version/1.1",
                title: "OpenAI NewsRoom Feeds",
                home_page_url: "https://openai.com/news/",
                description: "Aggregated OpenAI NewsRoom feeds",
                language: "en",
                items: []
            };
        }

        let publishedAfter = null;
        for (let i = 0; i < fetchPages; i++) {
            const userAgent = getRandomUserAgent();
            const headers = {
                'User-Agent': userAgent,
                'Content-Type': 'application/json',
                'accept': 'application/json',
                'accept-language': 'zh-CN,zh;q=0.9',
                'baggage': 'sentry-environment=stable,sentry-release=5251fa921ef6cbb6df0ac4271c41c2b4a0ce7c50,sentry-public_key=e5bccf7428aa4e881ed5cb713fdff181,sentry-trace_id=2da50ca5ad944cb794670097d876ada8,sentry-sampled=true,sentry-sample_rand=0.06211835167903246,sentry-sample_rate=1',
                'origin': 'https://app.folo.is',
                'priority': 'u=1, i',
                'sec-ch-ua': '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
                'sec-ch-ua-mobile': '?1',
                'sec-ch-ua-platform': '"Android"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-site',
                'x-app-name': 'Folo Web',
                'x-app-version': '0.4.9',
            };

            if (foloCookie) {
                headers['Cookie'] = foloCookie;
            }

            const body = {
                feedId: feedId,
                view: 1,
                withContent: true,
            };

            if (publishedAfter) {
                body.publishedAfter = publishedAfter;
            }

            try {
                console.log(`Fetching OpenAI NewsRoom data, page ${i + 1}...`);
                const response = await fetch(foloDataApi, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(body),
                    signal,
                });

                if (!response.ok) {
                    if (strict) throw providerHttpError(response.status);
                    console.error(`Failed to fetch OpenAI NewsRoom data, page ${i + 1}: ${await getFoloErrorMessage(response)}`);
                    break;
                }
                const data = await response.json();
                if (strict) assertFoloPayload(data);
                if (data && data.data && data.data.length > 0) {
                    const filteredItems = data.data.filter(entry => isDateWithinLastDays(entry.entries.publishedAt, filterDays));
                    allItems.push(...filteredItems.map(entry => ({
                        id: entry.entries.id,
                        url: entry.entries.url,
                        title: entry.entries.title,
                        content_html: entry.entries.content,
                        date_published: entry.entries.publishedAt,
                        authors: [{ name: entry.entries.author || 'OpenAI' }],
                        source: `openai-newsroom`,
                    })));
                    publishedAfter = data.data[data.data.length - 1].entries.publishedAt;
                } else {
                    console.log(`No more data for OpenAI NewsRoom, page ${i + 1}.`);
                    break;
                }
            } catch (error) {
                if (strict) throw normalizeProviderFailure(error);
                console.error(`Error fetching OpenAI NewsRoom data, page ${i + 1}:`, error);
                break;
            }

            await sleep(Math.random() * 5000, { signal });
        }

        return {
            version: "https://jsonfeed.org/version/1.1",
            title: "OpenAI NewsRoom Feeds",
            home_page_url: "https://openai.com/news/",
            description: "Aggregated OpenAI NewsRoom feeds",
            language: "en",
            items: allItems
        };
    },

    transform: (rawData, sourceType) => {
        const unifiedNews = [];
        if (rawData && Array.isArray(rawData.items)) {
            rawData.items.forEach((item) => {
                unifiedNews.push({
                    id: item.id,
                    type: sourceType,
                    url: item.url,
                    title: item.title,
                    description: stripHtml(item.content_html || ""),
                    published_date: item.date_published,
                    authors: item.authors ? item.authors.map(a => a.name).join(', ') : 'OpenAI',
                    source: item.source || 'OpenAI NewsRoom',
                    details: {
                        content_html: item.content_html || ""
                    }
                });
            });
        }
        return unifiedNews;
    },

    generateHtml: (item) => {
        return `
            <strong>${escapeHtml(item.title)}</strong><br>
            <small>来源: ${escapeHtml(item.source || '未知')} | 发布日期: ${formatDateToChineseWithTime(item.published_date)}</small>
            <div class="content-html">${item.details.content_html || '无内容。'}</div>
            <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">阅读更多</a>
        `;
    }
};

export default NewsDataSource;
