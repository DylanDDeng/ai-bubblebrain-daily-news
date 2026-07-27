import { createFoloFeedDataSource } from './folo-feed.js';

const CursorXDataSource = createFoloFeedDataSource({
  feedIdEnv: 'CURSOR_X_FEED_ID',
  fetchPagesEnv: 'CURSOR_X_FETCH_PAGES',
  sourceName: 'Cursor',
  logName: 'Cursor X',
  homePageUrl: 'https://x.com/cursor_ai',
  defaultFetchPages: '1',
});

export default CursorXDataSource;
