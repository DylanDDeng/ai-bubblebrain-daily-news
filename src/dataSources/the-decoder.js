import { createFoloFeedDataSource } from "./folo-feed.js";

const TheDecoderDataSource = createFoloFeedDataSource({
  feedIdEnv: "THE_DECODER_FEED_ID",
  fetchPagesEnv: "THE_DECODER_FETCH_PAGES",
  sourceName: "The Decoder",
  logName: "The Decoder",
  homePageUrl: "https://the-decoder.com/",
  defaultFetchPages: "1",
});

export default TheDecoderDataSource;
