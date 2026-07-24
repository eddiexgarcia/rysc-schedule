"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const SEASON = "TCYSA Summer 2026";
const SEASON_YEAR = 2026;
const OUTPUT_FILE = path.join(__dirname, "data", "games.json");
const BASE_URL = "https://www.thurstoncountysoccer.com";

const SOURCES = [
  { division: "BU08", path: "/schedule/723289/bu08" },
  { division: "BU09/U10 Green", path: "/schedule/723290/bu09u10-green" },
  { division: "BU09/U10 Orange", path: "/schedule/723291/bu09u10-orange" },
  { division: "BU11/U12", path: "/schedule/723292/bu11u12" },
  { division: "BU13/U14", path: "/schedule/723293/bu13u14" },
  { division: "BHS", path: "/schedule/723288/bhs" },
  { division: "GU08", path: "/schedule/723283/gu08" },
  { division: "GU09/U10 Green", path: "/schedule/723284/gu09u10-green" },
  { division: "GU09/U10 Orange", path: "/schedule/723285/gu09u10-orange" },
  { division: "GU11/U12", path: "/schedule/723286/gu11u12" },
  { division: "GU13/U14", path: "/schedule/723287/gu13u14" },
  { division: "GHS", path: "/schedule/723282/ghs" }
];

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

function parseDate(dateLabel) {
  const match = dateLabel.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (!match) return "";
  const month = match[1].padStart(2, "0");
  const day = match[2].padStart(2, "0");
  return `${SEASON_YEAR}-${month}-${day}`;
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

function parseSchedule(html, source) {
  const rows = html.match(
    /<tr\b[^>]*class="rg(?:Alt)?Row"[^>]*id="ctl00_ContentPlaceHolder1_StandingsResultsControl_ScheduleGrid_ctl00__\d+"[^>]*>[\s\S]*?<\/tr>/gi
  ) || [];

  return rows.map((row, index) => {
    const dateLabel = capture(row, "DateLabel");
    const timeLabel = capture(row, "TimeLabel");
    const home = capture(row, "HomeLabel");
    const away = capture(row, "AwayLabel");
    const location = capture(row, "ScheduleLabel");
    const date = parseDate(dateLabel);
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
        "User-Agent": "RYSC-Schedule-Widget/1.0 (+https://www.rochesteryouthsoccer.org/)"
      },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`${source.division}: HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const results = await Promise.allSettled(
    SOURCES.map(async (source) => parseSchedule(await fetchPage(source), source))
  );

  const errors = results
    .map((result, index) => result.status === "rejected"
      ? `${SOURCES[index].division}: ${result.reason?.message || result.reason}`
      : null)
    .filter(Boolean);

  if (errors.length) {
    throw new Error(`Schedule refresh failed:\n${errors.join("\n")}`);
  }

  const games = results
    .flatMap((result) => result.value)
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
      season: SEASON,
      generatedAt: new Date().toISOString(),
      sourceCount: SOURCES.length,
      gameCount: games.length
    },
    games
  };

  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Saved ${games.length} games from ${SOURCES.length} TCYSA divisions.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
