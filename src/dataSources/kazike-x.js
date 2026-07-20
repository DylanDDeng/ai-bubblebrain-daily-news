import { createFoloFeedDataSource } from "./folo-feed.js";

const KazikeXDataSource = createFoloFeedDataSource({
  feedIdEnv: "KAZIKE_X_FEED_ID",
  fetchPagesEnv: "KAZIKE_X_FETCH_PAGES",
  sourceName: "数字生命卡兹克",
  logName: "Kazike X",
  homePageUrl: "https://x.com/Khazix0918",
  filterDaysEnv: "KAZIKE_FILTER_DAYS",
  defaultFilterDays: "7",
});

export default KazikeXDataSource;
