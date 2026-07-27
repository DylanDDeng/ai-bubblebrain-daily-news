import { createFoloFeedDataSource } from './folo-feed.js';

const AnthropicXDataSource = createFoloFeedDataSource({
  feedIdEnv: 'ANTHROPIC_X_FEED_ID',
  fetchPagesEnv: 'ANTHROPIC_X_FETCH_PAGES',
  sourceName: 'Anthropic',
  logName: 'Anthropic X',
  homePageUrl: 'https://x.com/AnthropicAI',
  defaultFetchPages: '1',
});

export default AnthropicXDataSource;
