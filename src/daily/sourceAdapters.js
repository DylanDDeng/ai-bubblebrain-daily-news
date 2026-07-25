import AibaseDataSource from '../dataSources/aibase.js';
import XiaohuDataSource from '../dataSources/xiaohu.js';
import QBitDataSource from '../dataSources/qbit.js';
import SimonWillisonDataSource from '../dataSources/simonwillison.js';
import XinZhiYuanDataSource from '../dataSources/xinzhiyuan.js';
import OpenAInewsroomDataSource from '../dataSources/openai-newsroom.js';
import GithubTrendingDataSource from '../dataSources/github-trending.js';
import HuggingfacePapersDataSource from '../dataSources/huggingface-papers.js';
import JiqizhixinDataSource from '../dataSources/jiqizhixin.js';
import TwitterDataSource from '../dataSources/twitter.js';
import TwitterExtraDataSource from '../dataSources/twitter-extra.js';
import KazikeDataSource from '../dataSources/kazike.js';
import KazikeXDataSource from '../dataSources/kazike-x.js';
import AnthropicResearchDataSource from '../dataSources/anthropic-research.js';

function foloFeed(provider, contentType, adapter, idEnv, pageEnv) {
    return Object.freeze({
        provider,
        contentType,
        adapter,
        foloScope: Object.freeze({ kind: 'feed', idEnv, pageEnv }),
    });
}

function foloGlobal(provider, contentType, adapter, pageEnv) {
    return Object.freeze({
        provider,
        contentType,
        adapter,
        foloScope: Object.freeze({ kind: 'global', pageEnv }),
    });
}

export const STRUCTURED_SOURCE_ADAPTERS = Object.freeze([
    foloFeed('aibase', 'news', AibaseDataSource, 'AIBASE_FEED_ID', 'AIBASE_FETCH_PAGES'),
    foloFeed('xiaohu', 'news', XiaohuDataSource, 'XIAOHU_FEED_ID', 'XIAOHU_FETCH_PAGES'),
    foloFeed('qbit', 'news', QBitDataSource, 'QBIT_FEED_ID', 'QBIT_FETCH_PAGES'),
    foloFeed('kazike', 'news', KazikeDataSource, 'KAZIKE_FEED_ID', 'KAZIKE_FETCH_PAGES'),
    foloFeed(
        'simonwillison',
        'news',
        SimonWillisonDataSource,
        'SIMONWILLISON_FEED_ID',
        'SIMONWILLISON_FETCH_PAGES',
    ),
    foloFeed(
        'xinzhiyuan',
        'news',
        XinZhiYuanDataSource,
        'XINZHIYUAN_FEED_ID',
        'XINZHIYUAN_FETCH_PAGES',
    ),
    foloFeed(
        'openai_newsroom',
        'news',
        OpenAInewsroomDataSource,
        'OPENAI_NEWSROOM_FEED_ID',
        'OPENAI_NEWSROOM_FETCH_PAGES',
    ),
    foloFeed(
        'anthropic_research',
        'news',
        AnthropicResearchDataSource,
        'ANTHROPIC_RESEARCH_FEED_ID',
        'ANTHROPIC_RESEARCH_FETCH_PAGES',
    ),
    Object.freeze({ provider: 'github_trending', contentType: 'project', adapter: GithubTrendingDataSource }),
    foloFeed(
        'huggingface_papers',
        'paper',
        HuggingfacePapersDataSource,
        'HGPAPERS_FEED_ID',
        'HGPAPERS_FETCH_PAGES',
    ),
    foloFeed(
        'jiqizhixin',
        'paper',
        JiqizhixinDataSource,
        'JIQIZHIXIN_FEED_ID',
        'JIQIZHIXIN_FETCH_PAGES',
    ),
    foloGlobal('twitter', 'socialMedia', TwitterDataSource, 'TWITTER_FETCH_PAGES'),
    foloGlobal('twitter_extra', 'socialMedia', TwitterExtraDataSource, 'TWITTER_EXTRA_FETCH_PAGES'),
    foloFeed(
        'kazike_x',
        'socialMedia',
        KazikeXDataSource,
        'KAZIKE_X_FEED_ID',
        'KAZIKE_X_FETCH_PAGES',
    ),
]);
