import { createFoloFeedDataSource } from './folo-feed.js';

const SamAltmanXDataSource = createFoloFeedDataSource({
  feedIdEnv: 'SAM_ALTMAN_X_FEED_ID',
  fetchPagesEnv: 'SAM_ALTMAN_X_FETCH_PAGES',
  sourceName: 'Sam Altman',
  logName: 'Sam Altman X',
  homePageUrl: 'https://x.com/sama',
  defaultFetchPages: '1',
});

export default SamAltmanXDataSource;
