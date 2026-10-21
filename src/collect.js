// Pulls recent headlines from the news feeds in config.js.
import Parser from "rss-parser";
import { SOURCES, RULES } from "./config.js";

const parser = new Parser({
  timeout: 20000,
  headers: { "User-Agent": "Mozilla/5.0 (compatible; BayAreaRealEstateNews/1.0)" },
});

// Google News titles look like "Headline - Publisher"; keep the headline for matching.
export function normalizeTitle(title) {
  return title
    .replace(/\s+-\s+[^-]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function collectCandidates(seen) {
  const cutoff = Date.now() - RULES.lookbackDays * 24 * 60 * 60 * 1000;
  const byKey = new Map();

  // A hard per-feed deadline so one slow site can't stall the whole run.
  const withDeadline = (promise, ms) =>
    Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms / 1000}s`)), ms).unref())]);
  const results = await Promise.allSettled(SOURCES.map((s) => withDeadline(parser.parseURL(s.url), 25000)));

  for (const [i, result] of results.entries()) {
    const source = SOURCES[i];
    if (result.status === "rejected") {
      console.warn(`  ! Could not read ${source.name}: ${result.reason?.message}`);
      continue;
    }
    const feed = result.value;
    for (const item of feed.items || []) {
      if (!item.title || !item.link) continue;
      const published = item.isoDate ? Date.parse(item.isoDate) : Date.now();
      if (Number.isFinite(published) && published < cutoff) continue;
      const key = normalizeTitle(item.title);
      if (!key || byKey.has(key) || seen[key]?.covered) continue;
      byKey.set(key, {
        key,
        title: item.title.trim(),
        link: item.link,
        source: item.source?.title || item.creator || source.name.replace(/^Google News: .*/, "Google News"),
        published: new Date(published).toISOString(),
        snippet: (item.contentSnippet || "").replace(/\s+/g, " ").slice(0, 300),
      });
    }
  }

  return [...byKey.values()]
    .sort((a, b) => b.published.localeCompare(a.published))
    .slice(0, RULES.maxCandidatesForTriage);
}
