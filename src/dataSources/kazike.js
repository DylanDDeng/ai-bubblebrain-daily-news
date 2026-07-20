import { createFoloFeedDataSource } from "./folo-feed.js";

const KazikeDataSource = createFoloFeedDataSource({
  feedIdEnv: "KAZIKE_FEED_ID",
  fetchPagesEnv: "KAZIKE_FETCH_PAGES",
  sourceName: "数字生命卡兹克",
  logName: "Kazike",
  homePageUrl: "https://mp.weixin.qq.com/",
  filterDaysEnv: "KAZIKE_FILTER_DAYS",
  defaultFilterDays: "7",
});

export default KazikeDataSource;
