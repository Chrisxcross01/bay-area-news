# Bay Area Real Estate News

Automatically researches and writes Bay Area real estate news for
[chrisrenoisteam.com](https://chrisrenoisteam.com) and publishes it as an RSS feed.
Lofty's **RSS Aggregator** imports the feed as blog posts on the site.

## How it works

Every day at about 8 AM Pacific, GitHub runs `src/run.js`:

1. **Collect** – reads Google News searches and local news feeds (`src/config.js`) for
   the past week: real estate laws, property taxes, school district decisions, local
   housing policy and the market.
2. **Score** – Claude rates each new headline 1–10 for how much it matters to Bay Area
   homeowners, buyers and sellers.
3. **Write** – Claude reads the original sources (web search + page fetch) and writes an
   original article with a Sources section.
   - **Mondays:** a weekly roundup of the top stories (importance 5+).
   - **Other days:** a stand-alone article only if a story scores 8+ (at most one a day).
4. **Publish** – adds the article to `docs/feed.xml`, which GitHub Pages serves publicly.
   Every article ends with Chris's contact info and a "not legal or tax advice" note.

## One-time setup

1. **Anthropic API key** – create one at <https://platform.claude.com> (Settings → API
   keys) and add billing. Expect roughly a few dollars a month.
2. **GitHub repository** – create a repository (for example `bay-area-news`) and upload
   this folder's contents, including the hidden `.github` folder.
3. **Secret** – in the repository: Settings → Secrets and variables → Actions → New
   repository secret. Name: `ANTHROPIC_API_KEY`, value: your key.
4. **GitHub Pages** – Settings → Pages → Source: *Deploy from a branch*, Branch: `main`,
   Folder: `/docs`. Your feed URL becomes
   `https://<your-github-username>.github.io/<repository-name>/feed.xml`.
5. **First run** – Actions tab → *Bay Area real estate news* → *Run workflow*, mode
   `weekly`. Check the log, then open the feed URL.
6. **Lofty** – CMS → Blog → RSS Aggregator → Add New: paste the feed URL, Post Status
   **Draft** for the first few weeks (review and publish each post in Lofty), then switch
   it to **Published** once you trust the articles.

## Changing things

- **Topics and sources:** edit the searches in `src/config.js` (`GOOGLE_NEWS_QUERIES`, `SOURCES`).
- **Schedule:** `weeklyDay`, `urgentThreshold` and `maxUrgentPerDay` in `src/config.js`;
  run time in `.github/workflows/news.yml`.
- **Writing style and rules:** the instructions at the top of `src/claude.js`.
- **Contact info and disclaimer:** `SITE` in `src/config.js` and `footerHtml()` in `src/feed.js`.

## Running it yourself

Requires Node.js 20+.

```bash
npm install
npm run collect                              # list headlines (no API key needed)
ANTHROPIC_API_KEY=... npm run preview        # write a weekly roundup to out/preview.html without publishing
```

## Files

- `src/collect.js` – reads the news feeds
- `src/claude.js` – scoring and article writing (Claude Opus 5.5, with web search/fetch)
- `src/feed.js` – builds `docs/feed.xml` and simple no-index article pages
- `src/run.js` – decides weekly vs. urgent and publishes
- `data/` – published posts and the headlines already scored (so nothing is written twice)
