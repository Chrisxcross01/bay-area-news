// Everything you might want to tweak lives in this file.

export const SITE = {
  agentName: "Chris Renois",
  dre: "02030130",
  phone: "(650) 512-9817",
  email: "chrisrenois@therealexperts.com",
  websiteUrl: "https://chrisrenoisteam.com",
  valuationUrl: "https://chrisrenoisteam.com/evaluation",
  contactUrl: "https://chrisrenoisteam.com/contact",
  // Shown as the feed's title in Lofty's RSS Aggregator.
  feedTitle: "Bay Area Real Estate News | Chris Renois",
  feedDescription:
    "Weekly updates on Bay Area real estate laws, property taxes, school districts and the housing market.",
};

// Where the published feed lives. The GitHub workflow fills this in
// automatically from the repository name; set FEED_BASE_URL to override.
export const FEED_BASE_URL =
  process.env.FEED_BASE_URL ||
  (process.env.GITHUB_REPOSITORY
    ? `https://${process.env.GITHUB_REPOSITORY.split("/")[0].toLowerCase()}.github.io/${process.env.GITHUB_REPOSITORY.split("/")[1]}`
    : "http://localhost");

export const MODEL = "claude-opus-5-5";

// Publishing rules.
export const RULES = {
  timezone: "America/Los_Angeles",
  weeklyDay: 1, // 0 = Sunday, 1 = Monday. The weekly roundup is published on this day.
  urgentThreshold: 8, // Items scored this high (1-10) get their own article right away.
  maxUrgentPerDay: 1,
  lookbackDays: 8, // How far back to look for news.
  weeklyTopItems: 5, // How many stories the weekly roundup covers at most.
  maxCandidatesForTriage: 200,
  keepPostsInFeed: 30,
};

// Google News RSS searches. "when:7d" limits results to the last week.
// Add, remove or edit queries freely; each one is a plain Google News search.
// The focus is the Bay Area and Silicon Valley; statewide searches are limited to
// laws and taxes that apply to Bay Area homeowners.
const GOOGLE_NEWS_QUERIES = [
  // School districts (a priority topic)
  '"San Jose Unified" OR "Cupertino Union" OR "Fremont Unified" OR "Palo Alto Unified" OR "Santa Clara Unified"',
  '"Campbell Union" OR "Los Gatos" school district OR "Saratoga" school district OR "Cambrian School District" OR "Union School District" San Jose',
  '"Evergreen School District" OR "Oak Grove School District" OR "Berryessa Union" OR "Milpitas Unified" OR "East Side Union"',
  '"Fremont Union High" OR "Mountain View Whisman" OR "Los Altos School District" OR "Sunnyvale School District" OR "Morgan Hill Unified" OR "Gilroy Unified"',
  '"Menlo Park City School District" OR "Las Lomitas" OR "Sequoia Union" OR "Redwood City School District" OR "San Mateo-Foster City"',
  '"Bay Area" "school district" (boundary OR closure OR consolidation OR "new school" OR bond OR "parcel tax")',
  '"Santa Clara County" OR "San Mateo County" schools (closure OR boundary OR bond OR "parcel tax" OR consolidation)',
  // Large developments and infrastructure (a priority topic)
  '"San Jose" development approved OR groundbreaking OR "mixed-use" OR "housing project" OR towers',
  '"Santa Clara" OR Sunnyvale OR "Mountain View" OR Cupertino OR Milpitas development approved OR "housing project" OR "mixed-use"',
  'Fremont OR "Palo Alto" OR "Menlo Park" OR "Redwood City" OR "Los Gatos" OR Campbell development approved OR "housing project"',
  '"Downtown West" OR "BART Silicon Valley" OR "North San Jose" OR "Valley Fair" OR "Berryessa" development OR construction',
  '"Bay Area" ("housing development" OR megaproject OR "master plan" OR "breaks ground")',
  // Local housing laws and policy
  '"San Jose" OR "Santa Clara County" housing ordinance OR "rent control" OR "city council" homeowners',
  '"Sunnyvale" OR "Mountain View" OR "Palo Alto" OR Cupertino OR Fremont "city council" housing OR zoning',
  // Property taxes and assessments
  '"Santa Clara County" assessor OR "property tax" OR "assessment roll"',
  '"San Mateo County" OR "Alameda County" assessor OR "property tax"',
  // Statewide laws and taxes that apply to Bay Area homeowners
  'California new law homeowners OR landlords OR "home sellers" OR "home buyers" "takes effect" OR "signed"',
  'California "Prop 13" OR "Prop 19" OR "property tax" ballot OR law OR change',
  // Market
  '"Silicon Valley" OR "San Jose" OR "Bay Area" "home prices" OR "housing market" OR "home sales"',
];

export const SOURCES = [
  ...GOOGLE_NEWS_QUERIES.map((q) => ({
    name: `Google News: ${q.slice(0, 60)}`,
    url: `https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:7d")}&hl=en-US&gl=US&ceid=US:en`,
  })),
  // Direct Bay Area news feeds.
  { name: "San Jose Spotlight", url: "https://sanjosespotlight.com/feed/" },
  { name: "Palo Alto Online", url: "https://www.paloaltoonline.com/feed/" },
  { name: "Mountain View Voice", url: "https://www.mv-voice.com/feed/" },
  { name: "Los Altos Town Crier", url: "https://www.losaltosonline.com/search/?f=rss&t=article&l=50&s=start_time&sd=desc" },
  { name: "Silicon Valley Voice", url: "https://www.svvoice.com/feed/" },
  { name: "The Real Deal San Francisco", url: "https://therealdeal.com/san-francisco/feed/" },
  { name: "Bisnow San Francisco", url: "https://www.bisnow.com/rss/san-francisco" },
  { name: "Local News Matters", url: "https://localnewsmatters.org/feed/" },
  { name: "EdSource", url: "https://edsource.org/feed" },
];
