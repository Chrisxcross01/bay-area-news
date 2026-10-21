// Builds docs/feed.xml (read by Lofty's RSS Aggregator) plus simple
// no-index HTML pages so every feed link resolves.
import fs from "fs";
import path from "path";
import { SITE, FEED_BASE_URL, RULES } from "./config.js";

const DOCS = "docs";

const escapeXml = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const cdata = (s) => `<![CDATA[${String(s).replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;

// Appended to every article so the disclaimer and call to action never depend on the model.
export function footerHtml() {
  return `
<hr>
<p><strong>Thinking about buying or selling in the Bay Area?</strong> ${SITE.agentName} can walk you through how these changes affect your home and your plans. Call or text <a href="tel:+16505129817">${SITE.phone}</a>, email <a href="mailto:${SITE.email}">${SITE.email}</a>, or <a href="${SITE.valuationUrl}">get a free home value estimate</a>.</p>
<p><em>This article is general information for Bay Area homeowners and buyers, not legal, tax or financial advice. Laws, rates and deadlines change; please confirm details with the original sources linked above or a qualified professional. ${SITE.agentName}, California DRE #${SITE.dre}.</em></p>`;
}

export function slugify(title, date) {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
  return `${date.slice(0, 10)}-${base}`;
}

function pageHtml(post) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeXml(post.title)}</title>
<style>body{font:17px/1.65 Georgia,serif;max-width:720px;margin:40px auto;padding:0 16px;color:#222}a{color:#806b4f}</style>
</head><body>
<p><a href="${SITE.websiteUrl}">${escapeXml(SITE.agentName)}</a></p>
<h1>${escapeXml(post.title)}</h1>
<p><em>${new Date(post.date).toDateString()}</em></p>
${post.html}
</body></html>`;
}

export function writeFeed(posts) {
  const recent = [...posts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, RULES.keepPostsInFeed);
  fs.mkdirSync(path.join(DOCS, "posts"), { recursive: true });

  for (const post of recent) {
    fs.writeFileSync(path.join(DOCS, "posts", `${post.slug}.html`), pageHtml(post));
  }

  const items = recent
    .map((post) => {
      const url = `${FEED_BASE_URL}/posts/${post.slug}.html`;
      return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="false">${escapeXml(post.slug)}</guid>
      <pubDate>${new Date(post.date).toUTCString()}</pubDate>
      <dc:creator>${escapeXml(SITE.agentName)}</dc:creator>
      ${post.categories.map((c) => `<category>${escapeXml(c)}</category>`).join("")}
      <description>${escapeXml(post.summary)}</description>
      <content:encoded>${cdata(post.html)}</content:encoded>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE.feedTitle)}</title>
    <link>${SITE.websiteUrl}</link>
    <atom:link href="${FEED_BASE_URL}/feed.xml" rel="self" type="application/rss+xml"/>
    <description>${escapeXml(SITE.feedDescription)}</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;
  fs.writeFileSync(path.join(DOCS, "feed.xml"), xml);

  const list = recent
    .map((p) => `<li><a href="posts/${p.slug}.html">${escapeXml(p.title)}</a> <small>${p.date.slice(0, 10)}</small></li>`)
    .join("\n");
  fs.writeFileSync(
    path.join(DOCS, "index.html"),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>${escapeXml(SITE.feedTitle)}</title></head>
<body style="font:16px/1.6 sans-serif;max-width:720px;margin:40px auto;padding:0 16px">
<h1>${escapeXml(SITE.feedTitle)}</h1>
<p>This is the publishing feed for <a href="${SITE.websiteUrl}">${SITE.websiteUrl}</a>. Feed URL: <a href="feed.xml">${FEED_BASE_URL}/feed.xml</a></p>
<ul>${list || "<li>No articles yet.</li>"}</ul>
</body></html>`,
  );
}
