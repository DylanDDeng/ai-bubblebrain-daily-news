import { createFoloFeedDataSource } from "./folo-feed.js";

const AnthropicResearchDataSource = createFoloFeedDataSource({
  feedIdEnv: "ANTHROPIC_RESEARCH_FEED_ID",
  fetchPagesEnv: "ANTHROPIC_RESEARCH_FETCH_PAGES",
  sourceName: "Anthropic Research",
  logName: "Anthropic Research",
  homePageUrl: "https://www.anthropic.com/research",
  filterDaysEnv: "ANTHROPIC_RESEARCH_FILTER_DAYS",
  defaultFilterDays: "14",
});

export default AnthropicResearchDataSource;
