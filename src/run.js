// Entry point. Runs once a day (see .github/workflows/news.yml):
// - On the weekly day it publishes a roundup of the week's most important stories.
// - On other days it publishes a stand-alone article only when a story scores as urgent.
//
// Flags:
//   --mode=auto|weekly|urgent   default auto (weekly on RULES.weeklyDay, urgent otherwise)
//   --dry-run                   write out/preview.html instead of publishing
//   --collect-only              just list the headlines found (no API key needed)
import fs from "fs";
import { RULES, SITE } from "./config.js";
import { collectCandidates } from "./collect.js";
import { triage, writeWeekly, writeUrgent } from "./claude.js";
import { writeFeed, footerHtml, slugify } from "./feed.js";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const DRY_RUN = Boolean(args["dry-run"]);

const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback);
const writeJson = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");

const POSTS_FILE = "data/posts.json";
const SEEN_FILE = "data/seen.json";

function localDate(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: RULES.timezone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t).value;
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { ymd: `${get("year")}-${get("month")}-${get("day")}`, weekday };
}

function pruneSeen(seen) {
  const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000; // Remember stories for 60 days.
  for (const [key, entry] of Object.entries(seen)) {
    if (Date.parse(entry.firstSeen) < cutoff) delete seen[key];
  }
}

function publish(posts, seen, article, coveredItems, categories) {
  const date = new Date().toISOString();
  const post = {
    slug: slugify(article.title, date),
    title: article.title,
    summary: article.summary,
    html: `${article.html}\n${footerHtml()}`,
    categories: ["Real Estate News", ...categories],
    date,
  };

  if (DRY_RUN) {
    fs.mkdirSync("out", { recursive: true });
    fs.writeFileSync(
      "out/preview.html",
      `<!doctype html><meta charset="utf-8"><title>${post.title}</title><body style="max-width:720px;margin:40px auto;font:17px/1.6 Georgia,serif"><h1>${post.title}</h1><p><em>${post.summary}</em></p>${post.html}</body>`,
    );
    console.log(`\nDry run: preview written to out/preview.html ("${post.title}"). Nothing was published.`);
    return;
  }

  posts.push(post);
  for (const item of coveredItems) seen[item.key].covered = date;
  writeJson(POSTS_FILE, posts);
  writeJson(SEEN_FILE, seen);
  writeFeed(posts);
  console.log(`\nPublished: "${post.title}"`);
}

const CATEGORY_LABELS = {
  schools: "School Districts",
  development: "New Developments",
  law: "Real Estate Laws",
  property_tax: "Property Taxes",
  local_policy: "Local Housing Policy",
  market: "Market Updates",
};

async function main() {
  const posts = readJson(POSTS_FILE, []);
  const seen = readJson(SEEN_FILE, {});
  pruneSeen(seen);
  // Keep the published feed current even on days nothing new is written.
  if (!DRY_RUN && !args["collect-only"]) writeFeed(posts);

  const today = localDate();
  const mode = args.mode && args.mode !== "auto" ? args.mode : today.weekday === RULES.weeklyDay ? "weekly" : "urgent";
  console.log(`${today.ymd} — mode: ${mode}${DRY_RUN ? " (dry run)" : ""}`);

  // 1. Collect headlines.
  const candidates = await collectCandidates(seen);
  console.log(`Found ${candidates.length} new headlines.`);
  if (args["collect-only"]) {
    for (const c of candidates) console.log(`- ${c.published.slice(0, 10)}  ${c.title}`);
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it as a repository secret (see README).");
  }

  // 2. Score headlines we haven't scored before.
  const unscored = candidates.filter((c) => !seen[c.key]);
  if (unscored.length) {
    const scored = await triage(unscored);
    for (const s of scored) {
      seen[s.key] = {
        title: s.title, link: s.link, source: s.source, published: s.published,
        category: s.category, importance: s.relevant ? s.importance : 0, reason: s.reason,
        firstSeen: new Date().toISOString(), covered: false,
      };
    }
    console.log(`Scored ${scored.length} headlines.`);
  }
  if (!DRY_RUN) writeJson(SEEN_FILE, seen);

  const lookbackCutoff = Date.now() - RULES.lookbackDays * 24 * 60 * 60 * 1000;
  const pool = Object.entries(seen)
    .map(([key, e]) => ({ key, ...e }))
    .filter((e) => !e.covered && e.importance > 0 && Date.parse(e.published) >= lookbackCutoff)
    .sort((a, b) => b.importance - a.importance || b.published.localeCompare(a.published));

  for (const e of pool.slice(0, 10)) console.log(`  ${e.importance}/10 [${e.category}] ${e.title}`);

  // 3a. Weekly roundup.
  if (mode === "weekly") {
    const picks = pool.filter((e) => e.importance >= 5).slice(0, RULES.weeklyTopItems);
    if (picks.length === 0) {
      console.log("Nothing important enough for a roundup this week.");
      return;
    }
    const weekLabel = new Date().toLocaleDateString("en-US", { timeZone: RULES.timezone, month: "long", day: "numeric", year: "numeric" });
    const article = await writeWeekly(picks, weekLabel);
    const categories = [...new Set(picks.map((p) => CATEGORY_LABELS[p.category]).filter(Boolean))];
    publish(posts, seen, article, picks, categories);
    return;
  }

  // 3b. Urgent check.
  const publishedToday = posts.filter((p) => localDate(new Date(p.date)).ymd === today.ymd).length;
  if (publishedToday >= RULES.maxUrgentPerDay) {
    console.log("Already published today; skipping the urgent check.");
    return;
  }
  const top = pool[0];
  if (!top || top.importance < RULES.urgentThreshold) {
    console.log(`No story reached the urgent threshold (${RULES.urgentThreshold}/10). The weekly roundup will cover this week's news.`);
    return;
  }
  const related = pool.filter((e) => e !== top && e.category === top.category).slice(0, 3);
  const article = await writeUrgent(top, related);
  publish(posts, seen, article, [top, ...related], [CATEGORY_LABELS[top.category]].filter(Boolean));
}

main().then(
  // Exit explicitly so a lingering network connection can't keep the job running.
  () => process.exit(0),
  (err) => {
    console.error(`\nFailed: ${err.message}`);
    process.exit(1);
  },
);
