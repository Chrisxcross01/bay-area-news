// Cover photos. Lofty's RSS Aggregator uses the first image in an article as the post's featured
// image; with none, it filled in generic stock photos that had nothing to do with the story
// (Chris, Nov 13, 2026). Each article now gets a free-to-use Wikimedia Commons photo that shows the
// place or subject it's about, picked by Claude after looking at the candidates. The photo is saved
// under docs/images/ (served through jsDelivr, like the feed) and credited at the end of the article.
import fs from "fs";
import path from "path";
import { IMAGE_BASE_URL } from "./config.js";
import { searchCommons, download } from "./commons.js";
import { imageQueries, pickImage } from "./claude.js";

const PER_QUERY = 3;
const MAX_CANDIDATES = 8;

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Returns the saved photo's details, or null when no candidate fits the story.
export async function findImage(article, slug) {
  const queries = await imageQueries(article);
  const candidates = [];
  for (const query of queries) {
    let found = [];
    try {
      found = await searchCommons(query);
    } catch (err) {
      console.log(`  Photo search "${query}" failed: ${err.message}`);
    }
    for (const c of found.filter((f) => !candidates.some((x) => x.title === f.title)).slice(0, PER_QUERY)) {
      try {
        candidates.push({ ...c, query, bytes: await download(c.thumb) });
      } catch (err) {
        console.log(`  Skipped ${c.title}: ${err.message}`);
      }
    }
    if (candidates.length >= MAX_CANDIDATES) break;
  }
  if (candidates.length === 0) return null;

  const pick = await pickImage(article, candidates.slice(0, MAX_CANDIDATES));
  const chosen = candidates[pick.index];
  if (pick.index < 0 || !chosen) {
    console.log(`  No candidate fits "${article.title}": ${pick.reason}`);
    return null;
  }
  const file = `images/${slug}.${chosen.mime === "image/png" ? "png" : "jpg"}`;
  fs.mkdirSync(path.join("docs", "images"), { recursive: true });
  fs.writeFileSync(path.join("docs", file), chosen.bytes);
  return {
    file,
    url: `${IMAGE_BASE_URL}/${file}`,
    alt: pick.alt,
    why: pick.reason,
    title: chosen.title,
    page: chosen.page,
    author: chosen.author,
    license: chosen.license,
    licenseUrl: chosen.licenseUrl,
    query: chosen.query,
  };
}

// First thing in the article, so Lofty uses it as the featured image.
export function imageHtml(image) {
  return `<p><img src="${esc(image.url)}" alt="${esc(image.alt)}"></p>\n`;
}

// The credit line the license asks for, at the end of the article.
export function creditHtml(image) {
  const publicDomain = /^(cc0|public domain|pd\b)/i.test(image.license);
  const license = publicDomain
    ? "public domain"
    : image.licenseUrl
      ? `<a href="${esc(image.licenseUrl)}">${esc(image.license)}</a>`
      : esc(image.license);
  return `<p><em>Cover photo: <a href="${esc(image.page)}">${esc(image.author)}</a>, ${license}, via Wikimedia Commons.</em></p>\n`;
}

// Finds photos for recent posts that don't have one yet (posts from before Nov 13, 2026, or a day
// the photo step failed). Their article HTML is left alone, so Lofty doesn't see them as changed;
// the News Editor puts the photo on the Lofty post and its Google post. Returns how many changed.
export async function backfillImages(posts, { days = 30, max = 12 } = {}) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const todo = posts
    .filter((p) => !p.image && !p.imageNone && Date.parse(p.date) >= cutoff)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, max);
  let changed = 0;
  for (const post of todo) {
    try {
      const image = await findImage({ title: post.title, summary: post.summary, html: post.html }, post.slug);
      if (image) {
        post.image = image;
        console.log(`  Photo for "${post.title}": ${image.title} (${image.license})`);
      } else {
        post.imageNone = new Date().toISOString().slice(0, 10);
      }
      changed++;
    } catch (err) {
      console.log(`  Photo for "${post.title}" failed: ${err.message}`);
    }
  }
  return changed;
}
