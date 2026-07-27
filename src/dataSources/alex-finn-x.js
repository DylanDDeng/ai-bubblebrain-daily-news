import { createFoloFeedDataSource } from "./folo-feed.js";

const AlexFinnXDataSource = createFoloFeedDataSource({
  feedIdEnv: "ALEX_FINN_X_FEED_ID",
  fetchPagesEnv: "ALEX_FINN_X_FETCH_PAGES",
  sourceName: "Alex Finn",
  logName: "Alex Finn X",
  homePageUrl: "https://x.com/AlexFinnX",
});

export default AlexFinnXDataSource;
