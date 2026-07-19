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

export const STRUCTURED_SOURCE_ADAPTERS = Object.freeze([
    Object.freeze({ provider: 'aibase', contentType: 'news', adapter: AibaseDataSource }),
    Object.freeze({ provider: 'xiaohu', contentType: 'news', adapter: XiaohuDataSource }),
    Object.freeze({ provider: 'qbit', contentType: 'news', adapter: QBitDataSource }),
    Object.freeze({ provider: 'simonwillison', contentType: 'news', adapter: SimonWillisonDataSource }),
    Object.freeze({ provider: 'xinzhiyuan', contentType: 'news', adapter: XinZhiYuanDataSource }),
    Object.freeze({ provider: 'openai_newsroom', contentType: 'news', adapter: OpenAInewsroomDataSource }),
    Object.freeze({ provider: 'github_trending', contentType: 'project', adapter: GithubTrendingDataSource }),
    Object.freeze({ provider: 'huggingface_papers', contentType: 'paper', adapter: HuggingfacePapersDataSource }),
    Object.freeze({ provider: 'jiqizhixin', contentType: 'paper', adapter: JiqizhixinDataSource }),
    Object.freeze({ provider: 'twitter', contentType: 'socialMedia', adapter: TwitterDataSource }),
    Object.freeze({ provider: 'twitter_extra', contentType: 'socialMedia', adapter: TwitterExtraDataSource }),
]);
