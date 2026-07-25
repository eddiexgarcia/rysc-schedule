"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const OUTPUT_FILE = path.join(__dirname, "data", "games.json");
const BASE_URL = "https://www.thurstoncountysoccer.com";
const HOME_PATH = "/home";

function decodeHtml(value = "") {
  const named = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: "\""
  };
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
      if (entity[0] === "#") {
        const hexadecimal = entity[1].toLowerCase() === "x";
        const code = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      return named[entity.toLowerCase()] ?? match;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function capture(row, label) {
  const expression = new RegExp(`<span\\b[^>]*id="[^"]*_${label}"[^>]*>([\\s\\S]*?)<\\/span>`, "i");
  return decodeHtml(row.match(expression)?.[1] || "");
}

function captureMapUrl(row) {
  const raw = row.match(/<a\b[^>]*id="[^"]*_LocationLink"[^>]*href="([^"]+)"/i)?.[1] || "";
  const decoded = decodeHtml(raw);
  if (!decoded) return "";
  try {
    const url = new URL(decoded);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    if (!(url.hostname === "maps.google.com" || url.hostname.endsWith(".google.com"))) return "";
    url.protocol = "https:";
    return url.href;
  } catch {
    return "";
  }
}

function parseDate(dateLabel, seasonYear) {
  const match = dateLabel.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (!match) return "";
  const month = match[1].padStart(2, "0");
  const day = match[2].padStart(2, "0");
  return `${seasonYear}-${month}-${day}`;
}

function parseTime(timeLabel) {
  const match = timeLabel.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!match) return "";
  let hour = Number(match[1]);
  const minute = match[2];
  const meridiem = match[3].toUpperCase();
  if (meridiem === "AM" && hour === 12) hour = 0;
  if (meridiem === "PM" && hour !== 12) hour += 12;
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

function parseSchedule(html, source, seasonYear) {
  const rows = html.match(
    /<tr\b[^>]*class="rg(?:Alt)?Row"[^>]*id="ctl00_ContentPlaceHolder1_StandingsResultsControl_ScheduleGrid_ctl00__\d+"[^>]*>[\s\S]*?<\/tr>/gi
  ) || [];

  return rows.map((row, index) => {
    const dateLabel = capture(row, "DateLabel");
    const timeLabel = capture(row, "TimeLabel");
    const home = capture(row, "HomeLabel");
    const away = capture(row, "AwayLabel");
    const location = capture(row, "ScheduleLabel");
    const date = parseDate(dateLabel, seasonYear);
    const time24 = parseTime(timeLabel);

    if (!date || !time24 || !home || !away) return null;

    return {
      id: `${source.division}-${date}-${time24}-${home}-${away}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, ""),
      division: source.division,
      date,
      dateLabel,
      time24,
      timeLabel,
      home,
      away,
      location: location || "Location TBD",
      mapUrl: captureMapUrl(row),
      cancelled: /text-decoration\s*:\s*line-through/i.test(row),
      sourceUrl: new URL(source.path, BASE_URL).href,
      sourceOrder: index
    };
  }).filter(Boolean);
}

async function fetchPage(source) {
  const url = new URL(source.path, BASE_URL);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, {
      headers: {
        "Accept": "text/html,application/xhtml+xml",
        "User-Agent": "TCYSA-Schedule-Widget/1.0"
      },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`${source.division}: HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function discoverSources(html) {
  const sources = [];
  const seen = new Set();
  const anchors = html.matchAll(/<a\b[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi);

  for (const anchor of anchors) {
    const division = decodeHtml(anchor[3]);
    if (!division) continue;

    let url;
    try {
      url = new URL(decodeHtml(anchor[2]), BASE_URL);
    } catch {
      continue;
    }

    const match = url.pathname.match(/(?:\/sites\/tcysa)?(\/schedule\/\d+\/[^/?#]+)/i);
    if (!match) continue;

    const schedulePath = match[1].toLowerCase();
    if (seen.has(schedulePath)) continue;
    seen.add(schedulePath);
    sources.push({ division, path: schedulePath });
  }

  return sources;
}

function discoverSeason(pages) {
  for (const page of pages) {
    const text = decodeHtml(page.html);
    const match = text.match(/\bTCYSA\s+(?:Spring|Summer|Fall|Winter)\s+20\d{2}\b/i);
    if (match) {
      const season = match[0].replace(/\s+/g, " ");
      const year = Number(season.match(/\b20\d{2}\b/)?.[0]);
      if (Number.isInteger(year)) return { season, year };
    }
  }
  throw new Error("The active TCYSA season could not be identified.");
}

async function main() {
  const homeHtml = await fetchPage({ division: "TCYSA home page", path: HOME_PATH });
  const sources = discoverSources(homeHtml);
  if (sources.length === 0) {
    throw new Error("No active division schedule links were found on the TCYSA home page.");
  }

  const results = await Promise.allSettled(
    sources.map(async (source) => ({ source, html: await fetchPage(source) }))
  );

  const errors = results
    .map((result, index) => result.status === "rejected"
      ? `${sources[index].division}: ${result.reason?.message || result.reason}`
      : null)
    .filter(Boolean);

  if (errors.length) {
    throw new Error(`Schedule refresh failed:\n${errors.join("\n")}`);
  }

  const pages = results.map((result) => result.value);
  const { season, year } = discoverSeason(pages);

  const games = pages
    .flatMap(({ source, html }) => parseSchedule(html, source, year))
    .sort((a, b) => (
      a.date.localeCompare(b.date) ||
      a.time24.localeCompare(b.time24) ||
      a.division.localeCompare(b.division) ||
      a.sourceOrder - b.sourceOrder
    ))
    .map(({ sourceOrder, ...game }) => game);

  if (games.length === 0) {
    throw new Error("No schedule rows were found; keeping the previous data file.");
  }

  const payload = {
    meta: {
      season,
      generatedAt: new Date().toISOString(),
      sourceCount: sources.length,
      gameCount: games.length
    },
    games
  };

  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Saved ${games.length} games from ${sources.length} TCYSA divisions for ${season}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
