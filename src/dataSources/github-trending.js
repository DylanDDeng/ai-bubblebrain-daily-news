// src/dataSources/projects.js
import { fetchData, getISODate, removeMarkdownCodeBlock, formatDateToChineseWithTime, escapeHtml} from '../helpers.js';
import { callChatAPI } from '../chatapi.js';
import { normalizeProviderFailure, providerHttpError, providerInvalidShapeError } from '../daily/providerFailure.js';

const GITHUB_TRENDING_URL = 'https://github.com/trending';

function decodeHtmlEntities(value = '') {
    const namedEntities = {
        amp: '&',
        lt: '<',
        gt: '>',
        quot: '"',
        apos: "'",
        nbsp: ' '
    };

    return String(value).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
        if (entity[0] === '#') {
            const isHex = entity[1] && entity[1].toLowerCase() === 'x';
            const codePoint = parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10);
            return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
        }
        return Object.prototype.hasOwnProperty.call(namedEntities, entity) ? namedEntities[entity] : match;
    });
}

function cleanHtmlText(value = '') {
    return decodeHtmlEntities(value)
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractFirst(block, regex) {
    const match = regex.exec(block);
    return match ? cleanHtmlText(match[1]) : '';
}

function getTrendingSince(projectsApiUrl) {
    try {
        const url = new URL(projectsApiUrl || '');
        const since = url.searchParams.get('since');
        return since || 'daily';
    } catch {
        return 'daily';
    }
}

function parseGithubTrendingHtml(html) {
    const articleBlocks = html.match(/<article class="Box-row">[\s\S]*?<\/article>/g) || [];

    return articleBlocks.map((block) => {
        const repoMatch = /<h2[\s\S]*?<a[^>]+href="\/([^"?#]+)"[\s\S]*?<\/a>[\s\S]*?<\/h2>/i.exec(block);
        if (!repoMatch) {
            return null;
        }

        const repoPath = decodeHtmlEntities(repoMatch[1]).trim();
        const [owner, name] = repoPath.split('/');
        if (!owner || !name) {
            return null;
        }

        const builtBy = Array.from(block.matchAll(/<img[^>]+class="[^"]*avatar[^"]*"[^>]+alt="@([^"]+)"/gi))
            .map((match) => {
                const username = decodeHtmlEntities(match[1]).trim();
                return username ? { username, href: `https://github.com/${username}` } : null;
            })
            .filter(Boolean);

        return {
            owner,
            name,
            url: `https://github.com/${owner}/${name}`,
            description: extractFirst(block, /<p class="[^"]*col-9[^"]*"[^>]*>([\s\S]*?)<\/p>/i),
            language: extractFirst(block, /<span itemprop="programmingLanguage">([\s\S]*?)<\/span>/i),
            languageColor: extractFirst(block, /<span class="repo-language-color"[^>]*style="background-color:\s*([^;"]+)/i),
            totalStars: extractFirst(block, /href="\/[^"]+\/stargazers"[\s\S]*?<\/svg>\s*([\s\S]*?)<\/a>/i),
            forks: extractFirst(block, /href="\/[^"]+\/forks"[\s\S]*?<\/svg>\s*([\s\S]*?)<\/a>/i),
            starsToday: extractFirst(block, /([\d,]+)\s+stars?\s+today/i),
            builtBy
        };
    }).filter(Boolean);
}

function isExplicitGithubTrendingEmpty(html) {
    return /there (?:aren't|are no) any trending repositories/i.test(html);
}

function hasValidProjectShape(project) {
    if (!project || typeof project !== 'object') return false;
    if (typeof project.owner !== 'string' || !project.owner.trim()) return false;
    if (typeof project.name !== 'string' || !project.name.trim()) return false;
    try {
        const url = new URL(project.url);
        return url.protocol === 'https:' && url.hostname === 'github.com';
    } catch {
        return false;
    }
}

async function fetchGitHubTrendingProjects(projectsApiUrl, { strict = false, signal } = {}) {
    const since = getTrendingSince(projectsApiUrl);
    const response = await fetch(`${GITHUB_TRENDING_URL}?since=${encodeURIComponent(since)}`, {
        headers: {
            'Accept': 'text/html',
            'User-Agent': 'Mozilla/5.0 CloudFlare-AI-Insight-Daily'
        },
        signal,
    });

    if (!response.ok) {
        if (strict) throw providerHttpError(response.status);
        throw new Error(`GitHub Trending fallback failed: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const projects = parseGithubTrendingHtml(html);
    if (strict && projects.length === 0 && !isExplicitGithubTrendingEmpty(html)) {
        throw providerInvalidShapeError();
    }
    return projects;
}

const ProjectsDataSource = {
    fetch: async (env, _foloCookie, { strict = false, signal } = {}) => {
        console.log(strict
            ? 'Fetching projects from configured primary endpoint.'
            : `Fetching projects from: ${env.PROJECTS_API_URL}`);
        let projects = [];
        let primaryError = null;

        if (env.PROJECTS_API_URL) {
            try {
                projects = await fetchData(env.PROJECTS_API_URL, { signal });
            } catch (error) {
                primaryError = error;
                if (strict) {
                    console.error('Configured projects endpoint failed', {
                        errorType: normalizeProviderFailure(error).code,
                    });
                } else {
                    console.error("Error fetching projects data:", error.message);
                }
            }
        }

        if (!Array.isArray(projects)) {
            if (strict) console.error('Configured projects endpoint returned an invalid shape');
            else console.error("Projects data is not an array:", projects);
            projects = [];
        }
        if (strict && projects.length > 0 && !projects.every(hasValidProjectShape)) {
            primaryError = providerInvalidShapeError();
            projects = [];
        }

        if (projects.length === 0) {
            try {
                console.log("Fetching projects from GitHub Trending fallback...");
                projects = await fetchGitHubTrendingProjects(env.PROJECTS_API_URL, { strict, signal });
                console.log(`Fetched ${projects.length} projects from GitHub Trending fallback.`);
            } catch (fallbackError) {
                if (strict) throw normalizeProviderFailure(fallbackError);
                console.error("Error fetching GitHub Trending fallback:", fallbackError.message);
                return {
                    error: "Failed to fetch projects data",
                    details: primaryError ? primaryError.message : fallbackError.message,
                    fallbackDetails: fallbackError.message,
                    items: []
                };
            }
        }

        if (projects.length === 0) {
            console.log("No projects fetched from API.");
            if (strict) return [];
            return { items: [] };
        }

        if (env.OPEN_TRANSLATE !== "true") {
            console.warn("Skipping project description translations.");
            return projects.map(p => ({ ...p, description_zh: p.description || "" }));
        }

        const descriptionsToTranslate = projects
            .map(p => p.description || "")
            .filter(desc => typeof desc === 'string');

        const nonEmptyDescriptions = descriptionsToTranslate.filter(d => d.trim() !== "");
        if (nonEmptyDescriptions.length === 0) {
            console.log("No non-empty project descriptions to translate.");
            return projects.map(p => ({ ...p, description_zh: p.description || "" }));
        }
        const promptText = `Translate the following English project descriptions to Chinese.
Provide the translations as a JSON array of strings, in the exact same order as the input.
Each string in the output array must correspond to the string at the same index in the input array.
If an input description is an empty string, the corresponding translated string in the output array should also be an empty string.
Input Descriptions (JSON array of strings):
${JSON.stringify(descriptionsToTranslate)}
Respond ONLY with the JSON array of Chinese translations. Do not include any other text or explanations.
JSON Array of Chinese Translations:`;

        let translatedTexts = [];
        try {
            console.log(`Requesting translation for ${descriptionsToTranslate.length} project descriptions.`);
            const chatResponse = await callChatAPI(env, promptText, null, { signal });
            const parsedTranslations = JSON.parse(removeMarkdownCodeBlock(chatResponse)); // Assuming direct JSON array response

            if (parsedTranslations && Array.isArray(parsedTranslations) && parsedTranslations.length === descriptionsToTranslate.length) {
                translatedTexts = parsedTranslations;
            } else {
                console.warn(`Translation count mismatch or parsing error for project descriptions. Expected ${descriptionsToTranslate.length}, received ${parsedTranslations ? parsedTranslations.length : 'null'}. Falling back.`);
                translatedTexts = descriptionsToTranslate.map(() => null);
            }
        } catch (translationError) {
            if (strict) console.error('Failed to translate project descriptions in batch');
            else console.error("Failed to translate project descriptions in batch:", translationError.message);
            translatedTexts = descriptionsToTranslate.map(() => null);
        }

        return projects.map((project, index) => {
            const translated = translatedTexts[index];
            return {
                ...project,
                description_zh: (typeof translated === 'string') ? translated : (project.description || "")
            };
        });
    },
    transform: (projectsData, sourceType, { strict = false } = {}) => {
        const unifiedProjects = [];
        const now = getISODate();
        if (Array.isArray(projectsData)) {
            projectsData.forEach((project, index) => {
                unifiedProjects.push({
                    // Structured runs use the stable canonical URL; legacy keeps its old index ID.
                    id: strict ? project.url : index + 1,
                    type: sourceType,
                    url: project.url,
                    title: project.name,
                    description: project.description_zh || project.description || "",
                    published_date: now, // Projects don't have a published date, use current date
                    authors: project.owner ? [project.owner] : [],
                    source: "GitHub Trending",
                    details: {
                        owner: project.owner,
                        name: project.name,
                        language: project.language,
                        languageColor: project.languageColor,
                        totalStars: project.totalStars,
                        forks: project.forks,
                        starsToday: project.starsToday,
                        builtBy: project.builtBy || []
                    }
                });
            });
        }
        return unifiedProjects;
    },

    generateHtml: (item) => {
        return `
            <strong>${escapeHtml(item.title)}</strong> (所有者: ${escapeHtml(item.details.owner)})<br>
            <small>星标: ${escapeHtml(item.details.totalStars)} (今日: ${escapeHtml(item.details.starsToday)}) | 语言: ${escapeHtml(item.details.language || 'N/A')}</small>
            描述: ${escapeHtml(item.description) || 'N/A'}<br>
            <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">在 GitHub 上查看</a>
        `;
    }
};

export default ProjectsDataSource;
