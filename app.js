"use strict";

const DATA_URL = "data/games.json";
const DEFAULT_CLUB = "";
const CLUB_NAMES = {
  CBSC: "Chinqually Booters",
  CeYSC: "Centralia",
  OUSC: "Olympia United",
  RYSC: "Rochester",
  TeYSC: "Tenino",
  TSC: "Tumwater"
};

const elements = {
  search: document.querySelector("#search"),
  club: document.querySelector("#club"),
  division: document.querySelector("#division"),
  location: document.querySelector("#location"),
  date: document.querySelector("#date"),
  upcoming: document.querySelector("#upcoming"),
  clear: document.querySelector("#clear"),
  retry: document.querySelector("#retry"),
  games: document.querySelector("#games"),
  loading: document.querySelector("#loading"),
  error: document.querySelector("#error"),
  empty: document.querySelector("#empty"),
  count: document.querySelector("#result-count"),
  season: document.querySelector("#season"),
  updated: document.querySelector("#updated")
};

let schedule = [];
let metadata = {};

function normalize(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

function clubFromTeam(team) {
  return String(team || "").trim().split(/\s+/)[0].toUpperCase();
}

function formatUpdated(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return `Updated ${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(parsed)}`;
}

function gameStart(game) {
  const value = new Date(`${game.date}T${game.time24 || "00:00"}:00`);
  return Number.isNaN(value.getTime()) ? null : value;
}

function isUpcoming(game) {
  const start = gameStart(game);
  if (!start) return true;
  const endOfGame = new Date(start.getTime() + 3 * 60 * 60 * 1000);
  return endOfGame >= new Date();
}

function displayDate(game) {
  const parsed = new Date(`${game.date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return { weekday: "", day: game.dateLabel || "", month: "" };
  }
  return {
    weekday: new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(parsed),
    day: new Intl.DateTimeFormat("en-US", { day: "numeric" }).format(parsed),
    month: new Intl.DateTimeFormat("en-US", { month: "short" }).format(parsed)
  };
}

function safeMapUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol === "https:" && (host === "maps.google.com" || host.endsWith(".google.com"))) {
      return url.href;
    }
  } catch {
    return "";
  }
  return "";
}

function addText(parent, tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  parent.append(node);
  return node;
}

function createGameCard(game, selectedClub) {
  const card = document.createElement("article");
  card.className = `game-card${game.cancelled ? " cancelled" : ""}`;

  const date = displayDate(game);
  const dateBlock = document.createElement("div");
  dateBlock.className = "date-block";
  addText(dateBlock, "span", "weekday", date.weekday);
  addText(dateBlock, "span", "day", date.day);
  addText(dateBlock, "span", "month", date.month);

  const main = document.createElement("div");
  main.className = "game-main";
  addText(main, "span", "division", game.division);

  const matchup = document.createElement("p");
  matchup.className = "matchup";
  const home = addText(matchup, "span", clubFromTeam(game.home) === selectedClub ? "team-club" : "", game.home);
  home.setAttribute("aria-label", `Home team: ${game.home}`);
  addText(matchup, "span", "versus", "vs");
  const away = addText(matchup, "span", clubFromTeam(game.away) === selectedClub ? "team-club" : "", game.away);
  away.setAttribute("aria-label", `Away team: ${game.away}`);
  main.append(matchup);

  const meta = document.createElement("p");
  meta.className = "meta";
  const time = document.createElement("span");
  addText(time, "i", "meta-dot", "");
  time.append(document.createTextNode(game.timeLabel));
  meta.append(time);

  if (selectedClub) {
    const side = clubFromTeam(game.home) === selectedClub ? "Home" : "Away";
    addText(meta, "span", "", side);
  }
  if (game.cancelled) addText(meta, "span", "cancelled-label", "Cancelled");
  main.append(meta);

  const location = document.createElement("div");
  location.className = "location";
  addText(location, "span", "location-label", "Field");
  const mapUrl = safeMapUrl(game.mapUrl);
  if (mapUrl) {
    const link = addText(location, "a", "", game.location);
    link.href = mapUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.setAttribute("aria-label", `${game.location} — open directions`);
  } else {
    addText(location, "span", "plain-location", game.location);
  }

  card.append(dateBlock, main, location);
  return card;
}

function filterGames() {
  const query = normalize(elements.search.value);
  const club = elements.club.value.toUpperCase();
  const division = elements.division.value;
  const location = elements.location.value;
  const date = elements.date.value;

  return schedule.filter((game) => {
    const clubMatch = !club || clubFromTeam(game.home) === club || clubFromTeam(game.away) === club;
    const searchMatch = !query || normalize([game.home, game.away].join(" ")).includes(query);
    const divisionMatch = !division || game.division === division;
    const locationMatch = !location || game.location === location;
    const dateMatch = !date || game.date === date;
    const upcomingMatch = !elements.upcoming.checked || isUpcoming(game);
    return clubMatch && searchMatch && divisionMatch && locationMatch && dateMatch && upcomingMatch;
  });
}

function render() {
  const games = filterGames();
  const selectedClub = elements.club.value.toUpperCase();
  elements.games.replaceChildren(...games.map((game) => createGameCard(game, selectedClub)));
  elements.empty.hidden = games.length !== 0;
  elements.count.textContent = `${games.length} ${games.length === 1 ? "game" : "games"}`;

  const url = new URL(window.location.href);
  if (selectedClub) {
    url.searchParams.set("club", selectedClub);
  } else {
    url.searchParams.delete("club");
  }
  window.history.replaceState({}, "", url);
}

function populateFilters() {
  const divisions = [...new Set(schedule.map((game) => game.division))].sort();
  const currentDivision = elements.division.value;
  elements.division.replaceChildren(new Option("All divisions", ""));
  divisions.forEach((division) => elements.division.add(new Option(division, division)));
  elements.division.value = currentDivision;

  const locations = [...new Set(schedule.map((game) => game.location).filter(Boolean))].sort();
  const currentLocation = elements.location.value;
  elements.location.replaceChildren(new Option("All fields", ""));
  locations.forEach((location) => elements.location.add(new Option(location, location)));
  elements.location.value = currentLocation;

  const knownClubs = new Set([...elements.club.options].map((option) => option.value));
  const clubs = [...new Set(schedule.flatMap((game) => [
    clubFromTeam(game.home),
    clubFromTeam(game.away)
  ]))].filter(Boolean).sort();
  clubs.forEach((club) => {
    if (!knownClubs.has(club)) {
      const name = CLUB_NAMES[club];
      elements.club.add(new Option(name ? `${club} — ${name}` : club, club));
    }
  });
}

async function loadSchedule() {
  elements.loading.hidden = false;
  elements.error.hidden = true;
  elements.empty.hidden = true;
  elements.games.replaceChildren();
  elements.count.textContent = "Loading games…";

  try {
    const response = await fetch(`${DATA_URL}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Schedule request failed: ${response.status}`);
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.games)) throw new Error("Invalid schedule data");

    schedule = payload.games;
    metadata = payload.meta || {};
    populateFilters();

    const requestedClub = new URL(window.location.href).searchParams.get("club");
    if (requestedClub) {
      const normalizedClub = requestedClub.toUpperCase();
      if (![...elements.club.options].some((option) => option.value === normalizedClub)) {
        elements.club.add(new Option(normalizedClub, normalizedClub));
      }
      elements.club.value = normalizedClub;
    }

    elements.season.textContent = metadata.season || "TCYSA Schedule";
    elements.updated.textContent = formatUpdated(metadata.generatedAt);
    elements.loading.hidden = true;
    render();
  } catch (error) {
    console.error(error);
    elements.loading.hidden = true;
    elements.error.hidden = false;
    elements.count.textContent = "Unavailable";
  }
}

function clearFilters() {
  elements.search.value = "";
  elements.club.value = DEFAULT_CLUB;
  elements.division.value = "";
  elements.location.value = "";
  elements.date.value = "";
  elements.upcoming.checked = true;
  render();
}

["input", "change"].forEach((eventName) => {
  elements.search.addEventListener(eventName, render);
  elements.club.addEventListener(eventName, render);
  elements.division.addEventListener(eventName, render);
  elements.location.addEventListener(eventName, render);
  elements.date.addEventListener(eventName, render);
  elements.upcoming.addEventListener(eventName, render);
});
elements.clear.addEventListener("click", clearFilters);
elements.retry.addEventListener("click", loadSchedule);

loadSchedule();
