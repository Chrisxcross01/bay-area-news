// The two Claude steps: scoring headlines, then researching and writing an article.
import Anthropic from "@anthropic-ai/sdk";
import { MODEL, SITE } from "./config.js";

const client = new Anthropic(); // Reads ANTHROPIC_API_KEY from the environment.

const CATEGORIES = ["schools", "development", "law", "property_tax", "local_policy", "market", "other"];

// ---------- Step 1: score headlines ----------

const TRIAGE_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          relevant: { type: "boolean" },
          category: { type: "string", enum: CATEGORIES },
          importance: { type: "integer" },
          reason: { type: "string" },
        },
        required: ["id", "relevant", "category", "importance", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

const TRIAGE_INSTRUCTIONS = `You screen news headlines for ${SITE.agentName}, a licensed real estate agent serving San Jose, Silicon Valley and the wider San Francisco Bay Area (Santa Clara, San Mateo and Alameda counties).

The blog is about the Bay Area and Silicon Valley first. Its readers are homeowners, home buyers, home sellers and small landlords in Santa Clara County (San Jose, Santa Clara, Sunnyvale, Mountain View, Palo Alto, Los Altos, Cupertino, Saratoga, Los Gatos, Campbell, Milpitas, Morgan Hill, Gilroy), San Mateo County and Alameda County (especially Fremont).

Two topics are priorities and score higher than anything else of similar weight:
1. School district changes: attendance boundary changes, school closures, consolidations or mergers, new schools opening, bond or parcel tax measures, major enrollment or funding decisions.
2. Large new developments: big housing, mixed-use, office or retail projects and master plans being proposed, approved, breaking ground or opening; major transit and infrastructure projects (for example BART Silicon Valley, Caltrain, Downtown West, North San Jose, Valley Fair); big employer campus moves.

Score each headline's importance from 1 to 10:
- 9-10: a Bay Area school district decision on boundaries, closures, mergers, new schools or a bond/parcel tax; a large Bay Area development approved, breaking ground or opening; a new law, ordinance or property tax change that applies to Bay Area homeowners and was just passed, signed or takes effect soon; a deadline within the next 30 days.
- 6-8: a Bay Area school district or development proposal that is being debated; a city council housing or zoning decision in the area; new Bay Area or Silicon Valley housing market data; a significant California bill on housing or property taxes moving through the legislature.
- 3-5: California-wide housing news with only an indirect Bay Area angle; small local projects.
- 1-2: anything about another region (Southern California, Sacramento, other states) with no direct Bay Area effect; national news; opinion pieces; advertisements and press releases from lenders or vendors; celebrity home sales; crime, sports, obituaries.

Statewide news belongs above 5 only if it changes the rules for Bay Area homeowners, buyers or sellers (a new state law, a property tax rule). Mark relevant=false for anything scoring 1-2. Keep the reason to one short sentence. Return one entry per headline, using its id.`;

export async function triage(candidates) {
  if (candidates.length === 0) return [];
  const list = candidates
    .map((c, i) => `[${i}] ${c.title} (${c.source}, ${c.published.slice(0, 10)})${c.snippet ? ` — ${c.snippet}` : ""}`)
    .join("\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "low", format: { type: "json_schema", schema: TRIAGE_SCHEMA } },
    system: TRIAGE_INSTRUCTIONS,
    messages: [{ role: "user", content: `Headlines:\n${list}` }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(`Triage was declined (${response.stop_details?.category ?? "no category"}).`);
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Triage output was cut off; lower RULES.maxCandidatesForTriage.");
  }
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const { items } = JSON.parse(text);

  return items
    .filter((s) => Number.isInteger(s.id) && candidates[s.id])
    .map((s) => ({
      ...candidates[s.id],
      relevant: s.relevant,
      category: s.category,
      importance: Math.max(1, Math.min(10, s.importance)),
      reason: s.reason,
    }));
}

// ---------- Step 2: research and write ----------

const WRITER_INSTRUCTIONS = `You write news articles for the blog on ${SITE.websiteUrl}, the website of ${SITE.agentName}, a San Jose and Silicon Valley Realtor (California DRE #${SITE.dre}). Readers are Bay Area homeowners, buyers, sellers and small landlords.

Research first. Use web_fetch on the article links you are given and web_search to find the original source (the bill text, the county assessor's or city's announcement, the school district's notice, the official data release). Only state facts that you have confirmed in a source you actually read. If sources disagree or a detail can't be confirmed, say so or leave it out. Never invent numbers, dates, bill numbers, quotes or names.

Write in a warm, plain-English, professional voice, in the first person plural ("we") only where natural. Keep the focus local: name the Bay Area cities, neighborhoods, districts and streets involved. Explain what changed, who it affects, when it takes effect, and what Bay Area homeowners, buyers or sellers might want to do about it. For a development, cover its location, size (homes, square feet, height), timeline and stage of approval. For a school district change, cover which schools and attendance areas are affected and the key dates. Avoid hype, clickbait and alarm.

Rules you must follow:
- This is general information, not legal, tax or financial advice. Where readers may need advice, suggest a tax professional, attorney or lender as appropriate. Do not add a disclaimer yourself; one is appended automatically.
- Fair housing: never describe neighborhoods, cities or schools as better or worse for any group of people, and never use words like "safe", "family-friendly", "exclusive" or "desirable" to characterize an area. For school news, report only factual policy changes (boundaries, closures, bonds, calendars, funding) and their dates.
- Don't copy sentences from your sources. Summarize in your own words and attribute facts to the source ("according to the Santa Clara County Assessor's Office...").
- Length: 500-900 words.

Output format. Reply with exactly this structure and nothing after it:
TITLE: <headline, at most 90 characters, no clickbait>
SUMMARY: <one or two sentences for the post excerpt and meta description, at most 160 characters>
===HTML===
<article body in simple HTML using only <p>, <h2>, <h3>, <ul>, <ol>, <li>, <strong>, <em> and <a href>. No <h1>, no images, no inline styles. End with an <h2>Sources</h2> section listing every source you relied on as links.>
===END===`;

function weeklyPrompt(items, weekLabel) {
  const list = items
    .map((it, i) => `${i + 1}. [${it.category}, importance ${it.importance}] ${it.title}\n   Source: ${it.source}, ${it.published.slice(0, 10)}\n   Link: ${it.link}\n   Why it matters: ${it.reason}`)
    .join("\n");
  return `Write this week's Bay Area real estate news roundup for the week of ${weekLabel}.

Cover the stories below, most important first, each under its own <h2>. Lead with Bay Area school district and development news when there is any. Open with a two-sentence overview of the week. Skip any story you can't verify, and you may combine stories that cover the same development.

${list}`;
}

function urgentPrompt(item, related) {
  const relatedList = related.length
    ? `\n\nRelated coverage you may also use:\n${related.map((r) => `- ${r.title} (${r.source}) ${r.link}`).join("\n")}`
    : "";
  return `Write a stand-alone news article about this development, which was flagged as important for Bay Area homeowners and buyers:

${item.title}
Source: ${item.source}, ${item.published.slice(0, 10)}
Link: ${item.link}
Why it matters: ${item.reason}${relatedList}`;
}

async function runWriter(userPrompt) {
  const messages = [{ role: "user", content: userPrompt }];
  let message;
  for (let turn = 0; turn < 6; turn++) {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "high" },
      system: WRITER_INSTRUCTIONS,
      tools: [
        { type: "web_search_20260209", name: "web_search", max_uses: 8 },
        { type: "web_fetch_20260209", name: "web_fetch", max_uses: 8 },
      ],
      messages,
    });
    message = await stream.finalMessage();
    // A long research turn can pause; send it back to let Claude continue.
    if (message.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: message.content });
      continue;
    }
    break;
  }

  if (message.stop_reason === "refusal") {
    throw new Error(`Article was declined (${message.stop_details?.category ?? "no category"}).`);
  }
  if (message.stop_reason !== "end_turn") {
    throw new Error(`Writer stopped early (${message.stop_reason}).`);
  }
  const text = message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return parseArticle(text);
}

export function parseArticle(text) {
  const title = text.match(/TITLE:\s*(.+)/)?.[1]?.trim();
  const summary = text.match(/SUMMARY:\s*(.+)/)?.[1]?.trim();
  const html = text.match(/===HTML===\s*([\s\S]*?)\s*===END===/)?.[1]?.trim();
  if (!title || !summary || !html) {
    throw new Error("Writer reply was not in the expected format.");
  }
  if (/<script|<iframe|on\w+=/i.test(html)) {
    throw new Error("Writer reply contained disallowed HTML.");
  }
  return { title, summary, html };
}

export function writeWeekly(items, weekLabel) {
  return runWriter(weeklyPrompt(items, weekLabel));
}

export function writeUrgent(item, related) {
  return runWriter(urgentPrompt(item, related));
}
