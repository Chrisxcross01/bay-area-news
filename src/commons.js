// Searches Wikimedia Commons for free-to-use photos (no API key needed) and downloads them.
// Only licenses that allow reuse on a business blog with a credit line: public domain, CC0,
// CC BY and CC BY-SA. Anything NonCommercial, NoDerivatives or with extra restrictions is skipped.
const API = "https://commons.wikimedia.org/w/api.php";
const UA = "BayAreaNewsImages/1.0 (news blog cover photo picker)";
const OK_LICENSE = /^(cc0|public domain|pd\b|cc[ -]by(-sa)?[ -]\d(\.\d)?)/i;
const SKIP_TITLE = /\b(map|maps|logo|seal|flag|diagram|chart|graph|screenshot|icon|coat of arms|locator|poster|ballot)\b/i;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Wikimedia limits bursts ("429 Too Many Requests"): space requests out and back off when told to.
let lastRequest = 0;
async function politeFetch(url) {
  for (let attempt = 1; ; attempt++) {
    const wait = lastRequest + 1500 - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if ((res.status !== 429 && res.status !== 503) || attempt === 4) return res;
    const retryAfter = Number(res.headers.get("retry-after")) || 10 * attempt;
    await sleep(Math.min(60, retryAfter) * 1000);
  }
}

const strip = (s) => String(s ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// Landscape photos at least 1,000 px wide, without extreme panoramas or banners.
export async function searchCommons(query, { limit = 15, width = 1280 } = {}) {
  const params = new URLSearchParams({
    action: "query", format: "json", formatversion: "2",
    generator: "search", gsrsearch: `${query} filetype:bitmap`, gsrnamespace: "6", gsrlimit: String(limit),
    prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiurlwidth: String(width),
    iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|Credit|ImageDescription|Restrictions",
  });
  const res = await politeFetch(`${API}?${params}`);
  if (!res.ok) throw new Error(`Commons search failed (${res.status})`);
  const pages = (await res.json()).query?.pages ?? [];
  return pages
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((p) => {
      const ii = p.imageinfo?.[0];
      if (!ii) return null;
      const m = ii.extmetadata ?? {};
      const v = (k) => strip(m[k]?.value);
      return {
        title: p.title.replace(/^File:/, ""), mime: ii.mime, width: ii.width, height: ii.height,
        thumb: ii.thumburl || ii.url, page: ii.descriptionurl,
        license: v("LicenseShortName"), licenseUrl: m.LicenseUrl?.value ?? "",
        author: (v("Artist") || v("Credit") || "Unknown").slice(0, 120),
        description: v("ImageDescription").slice(0, 240), restrictions: v("Restrictions"),
      };
    })
    .filter((c) => c && /^image\/(jpeg|png)$/.test(c.mime) && c.width >= 1000
      && c.width >= c.height * 1.2 && c.width <= c.height * 2.2
      && OK_LICENSE.test(c.license) && !/\b(nc|nd)\b/i.test(c.license) && !c.restrictions && !SKIP_TITLE.test(c.title));
}

export async function download(url) {
  const res = await politeFetch(url);
  if (!res.ok) throw new Error(`Photo download failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}
