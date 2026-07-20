export const SOURCE_REGISTRY = Object.freeze({
    aibase: Object.freeze({ contentType: 'news', primaryIdentity: 'source_id' }),
    xiaohu: Object.freeze({ contentType: 'news', primaryIdentity: 'source_id' }),
    qbit: Object.freeze({ contentType: 'news', primaryIdentity: 'source_id' }),
    kazike: Object.freeze({ contentType: 'news', primaryIdentity: 'source_id' }),
    simonwillison: Object.freeze({ contentType: 'news', primaryIdentity: 'source_id' }),
    xinzhiyuan: Object.freeze({ contentType: 'news', primaryIdentity: 'source_id' }),
    openai_newsroom: Object.freeze({ contentType: 'news', primaryIdentity: 'source_id' }),
    github_trending: Object.freeze({ contentType: 'project', primaryIdentity: 'canonical_url' }),
    huggingface_papers: Object.freeze({ contentType: 'paper', primaryIdentity: 'source_id' }),
    jiqizhixin: Object.freeze({ contentType: 'paper', primaryIdentity: 'source_id' }),
    twitter: Object.freeze({ contentType: 'socialMedia', primaryIdentity: 'source_id' }),
    twitter_extra: Object.freeze({ contentType: 'socialMedia', primaryIdentity: 'source_id' }),
    kazike_x: Object.freeze({ contentType: 'socialMedia', primaryIdentity: 'source_id' }),
    reddit: Object.freeze({ contentType: 'socialMedia', primaryIdentity: 'source_id' }),
});

export function getSourcePolicy(provider) {
    return SOURCE_REGISTRY[provider] || null;
}
