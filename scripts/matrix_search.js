#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const SPECIFIC_SUMMARIZERS = [
  "carrierStopMatrix",
  "currencyNotice",
  "solutionList",
  "itineraryPriceSlider",
  "itineraryCarrierList",
  "itineraryDepartureTimeRanges",
  "itineraryArrivalTimeRanges",
  "durationSliderItinerary",
  "itineraryOrigins",
  "itineraryDestinations",
  "itineraryStopCountList",
  "warningsItinerary",
];

const CALENDAR_ONE_WAY_SUMMARIZERS = [
  "calendarOneWay",
  "overnightFlightsCalendar",
  "itineraryStopCountList",
  "itineraryCarrierList",
  "currencyNotice",
];

const CALENDAR_ROUND_TRIP_SUMMARIZERS = [
  "calendar",
  "overnightFlightsCalendar",
  "itineraryStopCountList",
  "itineraryCarrierList",
  "currencyNotice",
];

const TIME_BUCKETS = {
  0: { min: "00:00", max: "08:00" },
  1: { min: "08:00", max: "11:00" },
  2: { min: "11:00", max: "14:00" },
  3: { min: "14:00", max: "17:00" },
  4: { min: "17:00", max: "21:00" },
  5: { min: "21:00", max: "23:59" },
};

const MATRIX_HOME_URL = "https://matrix.itasoftware.com/";
const WAA_CREATE_URL =
  "https://waa-pa.clients6.google.com/$rpc/google.internal.waa.v1.Waa/Create";
const BLANK_PAGE_URL = "data:text/html,<html><body>bg</body></html>";
const DEFAULT_ENDPOINT = "https://alkalimatrix-pa.googleapis.com/v1/search?alt=json";
const WAA_CONFIG_CACHE_PATH = path.join(os.homedir(), ".cache", "flight-expert", "waa-config.json");
const WAA_CONFIG_CACHE_VERSION = 1;

async function fetchText(url, timeoutMs = 30_000) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${response.status}`);
  }
  return response.text();
}

function extractMatrixBundleUrl(html) {
  const match = html.match(/<script src="([^"]*gstatic\.com\/alkali\/[^"]+\.js)"/i);
  if (!match) {
    throw new Error("Could not find the Matrix application bundle URL");
  }
  if (match[1].startsWith("//")) {
    return `https:${match[1]}`;
  }
  return new URL(match[1], MATRIX_HOME_URL).toString();
}

function extractWaaRuntimeConfig(bundleSource) {
  const createIndex = bundleSource.indexOf("/google.internal.waa.v1.Waa/Create");
  if (createIndex === -1) {
    throw new Error("Could not find the Waa/Create RPC definition in the Matrix bundle");
  }

  const searchWindow = bundleSource.slice(Math.max(0, createIndex - 8_000), createIndex + 8_000);
  const bootstrapMatch = searchWindow.match(/this\.FW="([^"]+)"/);
  const apiKeyMatches = Array.from(searchWindow.matchAll(/this\.EA="([^"]+)"/g));
  const apiKeyMatch = apiKeyMatches.at(-1);

  if (!bootstrapMatch || !apiKeyMatch?.[1]) {
    throw new Error("Could not extract the WAA bootstrap or API key from the Matrix bundle");
  }

  return {
    apiKey: apiKeyMatch[1],
    bootstrap: bootstrapMatch[1],
  };
}

async function readCachedWaaConfig() {
  try {
    return JSON.parse(await readFile(WAA_CONFIG_CACHE_PATH, "utf8"));
  } catch {
    return null;
  }
}

async function writeCachedWaaConfig(cacheEntry) {
  await mkdir(path.dirname(WAA_CONFIG_CACHE_PATH), { recursive: true });
  await writeFile(WAA_CONFIG_CACHE_PATH, `${JSON.stringify(cacheEntry, null, 2)}\n`, "utf8");
}

async function getWaaRuntimeConfig() {
  const html = await fetchText(MATRIX_HOME_URL);
  const bundleUrl = extractMatrixBundleUrl(html);
  const cached = await readCachedWaaConfig();

  if (
    cached?.version === WAA_CONFIG_CACHE_VERSION &&
    cached.bundleUrl === bundleUrl &&
    cached.apiKey &&
    cached.bootstrap
  ) {
    return {
      apiKey: cached.apiKey,
      bootstrap: cached.bootstrap,
    };
  }

  const bundleSource = await fetchText(bundleUrl, 60_000);
  const config = extractWaaRuntimeConfig(bundleSource);
  await writeCachedWaaConfig({
    ...config,
    bundleUrl,
    fetchedAt: new Date().toISOString(),
    version: WAA_CONFIG_CACHE_VERSION,
  });
  return config;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function loadPayload(filePath) {
  const raw = filePath ? await readFile(filePath, "utf8") : await readStdin();
  return JSON.parse(raw);
}

function encodeSearchValue(sitePayload) {
  const raw = Buffer.from(JSON.stringify(sitePayload), "utf8").toString("base64");
  return raw.replace(/=+$/u, "");
}

function buildMatrixUrl(sitePayload) {
  const encoded = encodeSearchValue(sitePayload);
  return `https://matrix.itasoftware.com/search?search=${encodeURIComponent(encoded)}`;
}

function parseIntValue(value, defaultValue = 0) {
  if (value === null || value === undefined || value === "" || value === false) {
    return defaultValue;
  }
  return Number.parseInt(String(value), 10);
}

function decodeDateModifier(value) {
  const raw = parseIntValue(value, 0);
  return { minus: Math.floor(raw / 10), plus: raw % 10 };
}

function preferredTimeRanges(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  const ranges = values
    .map((value) => TIME_BUCKETS[Number.parseInt(String(value), 10)])
    .filter(Boolean);
  return ranges.length > 0 ? ranges : null;
}

function boolString(value, defaultValue = false) {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  if (typeof value === "boolean") {
    return value;
  }
  return String(value).toLowerCase() === "true";
}

function nonEmptyString(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text || null;
}

function addOneMonth(dateText) {
  const [year, month, day] = dateText.split("-").map((part) => Number.parseInt(part, 10));
  let nextMonth = month + 1;
  let nextYear = year;
  if (nextMonth === 13) {
    nextMonth = 1;
    nextYear += 1;
  }

  const lastDayOfNextMonth = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
  const nextDay = Math.min(day, lastDayOfNextMonth);
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-${String(nextDay).padStart(2, "0")}`;
}

function parseDuration(value) {
  const text = nonEmptyString(value);
  if (!text) {
    throw new Error("calendar round-trip payload must include dates.duration");
  }
  if (text.includes("-")) {
    const [start, end] = text.split("-", 2);
    return {
      min: Number.parseInt(start.trim(), 10),
      max: Number.parseInt(end.trim(), 10),
    };
  }
  const nights = Number.parseInt(text, 10);
  return { min: nights, max: nights };
}

function ensureSupportedSearch(payload) {
  if (payload.type === "multi-city") {
    for (const [index, slice] of (payload.slices || []).entries()) {
      const searchDateType = (slice.dates || {}).searchDateType || "specific";
      if (searchDateType !== "specific") {
        throw new Error(
          `slice ${index + 1} uses searchDateType=${JSON.stringify(searchDateType)}; multi-city searches only support specific-date API mode`,
        );
      }
    }
    return "specific";
  }

  const searchDateType = ((payload.slices || [])[0]?.dates || {}).searchDateType || "specific";
  if (!["specific", "calendar"].includes(searchDateType)) {
    throw new Error(`unsupported searchDateType=${JSON.stringify(searchDateType)}`);
  }
  return searchDateType;
}

function makeSpecificApiSlice({
  origins,
  destinations,
  date,
  dateModifier,
  dateType,
  preferredTimes,
  routing,
  ext,
}) {
  const apiSlice = {
    origins,
    destinations,
    date,
    dateModifier: decodeDateModifier(dateModifier),
    isArrivalDate: String(dateType || "depart") === "arrive",
    filter: { warnings: { values: [] } },
    selected: false,
  };

  const timeRanges = preferredTimeRanges(preferredTimes);
  if (timeRanges) {
    apiSlice.timeRanges = timeRanges;
  }

  const routeLanguage = nonEmptyString(routing);
  if (routeLanguage) {
    apiSlice.routeLanguage = routeLanguage;
  }

  const commandLine = nonEmptyString(ext);
  if (commandLine) {
    apiSlice.commandLine = commandLine;
  }

  return apiSlice;
}

function siteSlicesToSpecificApiSlices(payload) {
  const tripType = payload.type;
  const siteSlices = payload.slices || [];

  if (tripType === "round-trip") {
    if (siteSlices.length !== 1) {
      throw new Error("round-trip payload must contain exactly one site slice");
    }

    const outbound = siteSlices[0];
    const dates = outbound.dates || {};
    if (!dates.returnDate) {
      throw new Error("round-trip payload must include dates.returnDate");
    }

    return [
      makeSpecificApiSlice({
        origins: outbound.origin,
        destinations: outbound.dest,
        date: dates.departureDate,
        dateModifier: dates.departureDateModifier,
        dateType: dates.departureDateType,
        preferredTimes: dates.departureDatePreferredTimes,
        routing: outbound.routing,
        ext: outbound.ext,
      }),
      makeSpecificApiSlice({
        origins: outbound.dest,
        destinations: outbound.origin,
        date: dates.returnDate,
        dateModifier: dates.returnDateModifier,
        dateType: dates.returnDateType,
        preferredTimes: dates.returnDatePreferredTimes,
        routing: outbound.routingRet,
        ext: outbound.extRet,
      }),
    ];
  }

  return siteSlices.map((siteSlice) => {
    const dates = siteSlice.dates || {};
    return makeSpecificApiSlice({
      origins: siteSlice.origin,
      destinations: siteSlice.dest,
      date: dates.departureDate,
      dateModifier: dates.departureDateModifier,
      dateType: dates.departureDateType,
      preferredTimes: dates.departureDatePreferredTimes,
      routing: siteSlice.routing,
      ext: siteSlice.ext,
    });
  });
}

function makeCalendarApiSlice(origins, destinations, routing, ext) {
  const apiSlice = {
    origins,
    destinations,
  };

  const routeLanguage = nonEmptyString(routing);
  if (routeLanguage) {
    apiSlice.routeLanguage = routeLanguage;
  }

  const commandLine = nonEmptyString(ext);
  if (commandLine) {
    apiSlice.commandLine = commandLine;
  }

  return apiSlice;
}

function normalizedPax(sitePayload) {
  const paxRaw = sitePayload.pax || {};
  return {
    adults: parseIntValue(paxRaw.adults, 1),
    children: parseIntValue(paxRaw.children, 0),
    infantsInLap: parseIntValue(paxRaw.infantsInLap, 0),
    infantsInSeat: parseIntValue(paxRaw.infantsInSeat, 0),
    seniors: parseIntValue(paxRaw.seniors, 0),
    youth: parseIntValue(paxRaw.youth, 0),
  };
}

function calendarInputs(sitePayload) {
  if (sitePayload.type === "multi-city") {
    throw new Error("calendar searches do not support multi-city payloads");
  }

  const options = sitePayload.options || {};
  const pax = normalizedPax(sitePayload);
  const firstSlice = (sitePayload.slices || [])[0];
  const dates = firstSlice?.dates || {};
  const departureDate = nonEmptyString(dates.departureDate);
  if (!departureDate) {
    throw new Error("calendar search must include dates.departureDate");
  }

  const inputs = {
    filter: {},
    page: { size: 25 },
    pax,
    firstDayOfWeek: "SUNDAY",
    internalUser: false,
    sliceIndex: 0,
    sorts: "default",
    startDate: departureDate,
    endDate: addOneMonth(departureDate),
    cabin: options.cabin || "COACH",
    changeOfAirport: boolString(options.allowAirportChanges, true),
    checkAvailability: boolString(options.showOnlyAvailable, true),
  };

  const stops = parseIntValue(options.stops, -1);
  if (stops !== -1) {
    inputs.maxStopCount = stops;
  }

  const extraStops = parseIntValue(options.extraStops, -1);
  if (extraStops !== -1) {
    inputs.maxLegsRelativeToMin = extraStops;
  }

  const currency = options.currency;
  if (currency && typeof currency === "object" && currency.code) {
    inputs.currency = currency.code;
  }

  const salesCity = options.salesCity;
  if (salesCity && typeof salesCity === "object" && salesCity.code) {
    inputs.salesCity = salesCity.code;
  }

  if (sitePayload.type === "round-trip") {
    inputs.slices = [
      makeCalendarApiSlice(firstSlice.origin, firstSlice.dest, firstSlice.routing, firstSlice.ext),
      makeCalendarApiSlice(firstSlice.dest, firstSlice.origin, firstSlice.routingRet, firstSlice.extRet),
    ];
    inputs.layover = parseDuration(dates.duration);
    return [inputs, "calendarRoundTrip", CALENDAR_ROUND_TRIP_SUMMARIZERS];
  }

  inputs.slices = [
    makeCalendarApiSlice(firstSlice.origin, firstSlice.dest, firstSlice.routing, firstSlice.ext),
  ];
  return [inputs, "calendarOneWay", CALENDAR_ONE_WAY_SUMMARIZERS];
}

function buildBgProgramPayload(requestBody) {
  const slices = requestBody.inputs.slices || [];
  const layover = requestBody.inputs.layover || {};
  const payload = {
    calendarMinDuration: requestBody.inputs.layover ? String(layover.min ?? "") : "",
    calendarMaxDuration: requestBody.inputs.layover ? String(layover.max ?? "") : "",
  };

  for (let index = 0; index < 6; index += 1) {
    if (index < slices.length) {
      const slice = slices[index];
      payload[`origin${index + 1}`] = (slice.origins || []).join("-");
      payload[`destination${index + 1}`] = (slice.destinations || []).join("-");
      payload[`date${index + 1}`] = nonEmptyString(slice.date) || "";
    } else {
      payload[`origin${index + 1}`] = "";
      payload[`destination${index + 1}`] = "";
      payload[`date${index + 1}`] = "";
    }
  }

  return payload;
}

function executableExists(command) {
  const searchPaths = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  for (const searchPath of searchPaths) {
    const candidate = path.join(searchPath, command);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return true;
    } catch {}
  }
  return false;
}

function requireAgentBrowser() {
  if (executableExists("agent-browser")) {
    return;
  }
  throw new Error("calendar searches require the agent-browser CLI to generate Matrix bgProgramResponse");
}

function runAgentBrowser(args, { session, inputText = null }) {
  const result = spawnSync("agent-browser", ["--session", session, ...args], {
    encoding: "utf8",
    input: inputText,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error((result.stderr || "").trim() || `agent-browser exited with status ${result.status}`);
  }

  return (result.stdout || "").trim();
}

async function generateBgProgramResponse(requestBody) {
  requireAgentBrowser();
  const waaConfig = await getWaaRuntimeConfig();
  const session = `matrix-bg-${Math.random().toString(16).slice(2, 14)}`;
  const vpa = buildBgProgramPayload(requestBody);
  const evalJs = [
    "(async () => {",
    `  const createResp = await fetch(${JSON.stringify(WAA_CREATE_URL)}, {`,
    '    method: "POST",',
    "    headers: {",
    '      "content-type": "application/json+protobuf",',
    `      "x-goog-api-key": ${JSON.stringify(waaConfig.apiKey)},`,
    '      "x-user-agent": "grpc-web-javascript/0.1"',
    "    },",
    `    body: JSON.stringify([${JSON.stringify(waaConfig.bootstrap)}, null, null])`,
    "  }).then(r => r.json());",
    "  const resp = createResp[0];",
    '  const scriptUrl = "https:" + resp[2][3];',
    "  await new Promise((resolve, reject) => {",
    '    const script = document.createElement("script");',
    "    script.src = scriptUrl;",
    "    script.onload = resolve;",
    "    script.onerror = reject;",
    "    document.documentElement.appendChild(script);",
    "  });",
    "  let setup;",
    "  const onSetup = (...args) => { setup = args; };",
    "  window[resp[5]].a(",
    "    resp[4],",
    "    onSetup,",
    "    true,",
    "    undefined,",
    "    () => {},",
    "    [[], []],",
    "    undefined,",
    "    false,",
    "    [() => {}, () => {}, () => {}, () => {}]",
    "  );",
    "  await new Promise(resolve => setTimeout(resolve, 100));",
    "  const ipa = setup && setup[0];",
    "  if (!ipa) {",
    '    throw new Error("Botguard setup did not yield an ipa function");',
    "  }",
    `  return await new Promise(resolve => ipa(resolve, [${JSON.stringify(vpa)}, undefined, undefined, undefined]));`,
    "})()",
  ].join("\n");

  try {
    runAgentBrowser(["open", BLANK_PAGE_URL], { session });
    runAgentBrowser(["wait", "--load", "networkidle"], { session });
    const output = runAgentBrowser(["eval", evalJs], { session });
    return JSON.parse(output);
  } finally {
    try {
      runAgentBrowser(["close"], { session });
    } catch {}
  }
}

function buildSpecificRequestBody(sitePayload) {
  const options = sitePayload.options || {};
  const paxRaw = sitePayload.pax || {};
  const pax = Object.fromEntries(
    Object.entries(paxRaw).filter(([, value]) => ![null, "", "0", 0].includes(value)).map(([key, value]) => [key, Number.parseInt(String(value), 10)]),
  );

  const inputs = {
    filter: {},
    page: { current: 1, size: 25 },
    pax,
    slices: siteSlicesToSpecificApiSlices(sitePayload),
    firstDayOfWeek: "SUNDAY",
    internalUser: false,
    sliceIndex: 0,
    sorts: "default",
    cabin: options.cabin || "COACH",
    changeOfAirport: boolString(options.allowAirportChanges, true),
    checkAvailability: boolString(options.showOnlyAvailable, true),
  };

  const stops = parseIntValue(options.stops, -1);
  if (stops !== -1) {
    inputs.maxStopCount = stops;
  }

  const extraStops = parseIntValue(options.extraStops, -1);
  if (extraStops !== -1) {
    inputs.maxLegsRelativeToMin = extraStops;
  }

  const currency = options.currency;
  if (currency && typeof currency === "object" && currency.code) {
    inputs.currency = currency.code;
  }

  const salesCity = options.salesCity;
  if (salesCity && typeof salesCity === "object" && salesCity.code) {
    inputs.salesCity = salesCity.code;
  }

  return {
    summarizers: SPECIFIC_SUMMARIZERS,
    inputs,
    summarizerSet: "wholeTrip",
    name: "specificDatesSlice",
  };
}

async function buildCalendarRequestBody(sitePayload) {
  const [inputs, summarizerSet, summarizers] = calendarInputs(sitePayload);
  const requestBody = {
    summarizers,
    inputs,
    summarizerSet,
    name: "calendar",
  };
  requestBody.bgProgramResponse = await generateBgProgramResponse(requestBody);
  return requestBody;
}

async function buildRequestBody(sitePayload) {
  const searchMode = ensureSupportedSearch(sitePayload);
  if (searchMode === "calendar") {
    return buildCalendarRequestBody(sitePayload);
  }
  return buildSpecificRequestBody(sitePayload);
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    throw new Error(`Matrix search failed with ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

function summarizeSolution(solution) {
  const itinerary = solution.itinerary || {};
  const slices = (itinerary.slices || []).map((slice) => ({
    origin: slice.origin?.code,
    destination: slice.destination?.code,
    departure: slice.departure,
    arrival: slice.arrival,
    duration_minutes: slice.duration,
    cabins: slice.cabins || [],
    flights: slice.flights || [],
    stops: (slice.stops || [])
      .filter((stop) => stop && typeof stop === "object" && stop.code)
      .map((stop) => stop.code),
    warnings: slice.ext?.warnings?.types || [],
  }));

  const carriers = (itinerary.carriers || [])
    .filter((carrier) => carrier && typeof carrier === "object" && carrier.code)
    .map((carrier) => carrier.code);

  return {
    id: solution.id,
    price: solution.displayTotal,
    passenger_count: solution.passengerCount,
    carriers,
    dominant_carrier: itinerary.ext?.dominantCarrier?.code,
    distance_miles: itinerary.distance?.value,
    slices,
  };
}

function parsePriceValue(text) {
  if (!text) {
    return [Number.MAX_SAFE_INTEGER, ""];
  }
  const digits = Array.from(text).filter((char) => /\d/u.test(char)).join("");
  return [digits ? Number.parseInt(digits, 10) : Number.MAX_SAFE_INTEGER, text];
}

function calendarDayEntries(response) {
  if (response.calendarOneWay) {
    const entries = [];
    for (const month of response.calendarOneWay.months || []) {
      for (const week of month.weeks || []) {
        for (const day of week.days || []) {
          if (day.disabled || !day.solutionCount || !day.solution) {
            continue;
          }
          entries.push({
            departure_date: day.date,
            price: day.minPrice,
            solution_count: day.solutionCount,
            arrival: day.solution?.itinerary?.arrival,
            overnight: Boolean(day.solution?.ext?.warnings?.overnight),
          });
        }
      }
    }
    return ["calendar-one-way", entries];
  }

  const entries = [];
  for (const month of response.calendar?.months || []) {
    for (const week of month.weeks || []) {
      for (const day of week.days || []) {
        const tripDuration = day.tripDuration || {};
        for (const option of tripDuration.options || []) {
          const solution = option.solution || {};
          const slices = solution.slices || [];
          entries.push({
            departure_date: day.date,
            trip_length: option.tripLength,
            price: option.minPrice,
            solution_count: option.solutionCount,
            outbound_departure: slices.length > 0 ? slices[0]?.departure : null,
            return_departure: slices.length > 1 ? slices[1]?.departure : null,
            arrival: solution.itinerary?.arrival,
            overnight: Boolean(solution.ext?.warnings?.overnight),
          });
        }
      }
    }
  }
  return ["calendar-round-trip", entries];
}

function buildSpecificSummary(sitePayload, response, limit) {
  const solutionList = response.solutionList || {};
  const solutions = solutionList.solutions || [];
  const warningsRaw = response.warningsItinerary;
  const warnings = [];

  if (warningsRaw && typeof warningsRaw === "object" && !Array.isArray(warningsRaw)) {
    for (const row of warningsRaw.rows || []) {
      if (row && typeof row === "object" && row.label) {
        warnings.push(row.label);
      }
    }
  } else if (Array.isArray(warningsRaw)) {
    for (const entry of warningsRaw) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      for (const group of entry.groups || []) {
        if (group && typeof group === "object" && group.label) {
          warnings.push(group.label);
        }
      }
    }
  }

  return {
    mode: "specific",
    solution_count: response.solutionCount,
    min_price: solutionList.minPrice || response.currencyNotice?.ext?.price,
    carriers: (response.itineraryCarrierList?.groups || [])
      .filter((group) => group && typeof group === "object")
      .map((group) => group.label?.code),
    solutions: solutions.slice(0, limit).map(summarizeSolution),
    warnings,
    matrix_url: buildMatrixUrl(sitePayload),
  };
}

function buildCalendarSummary(sitePayload, response, limit) {
  const [mode, entries] = calendarDayEntries(response);
  const sortedEntries = [...entries].sort((left, right) => {
    const [leftPrice] = parsePriceValue(left.price);
    const [rightPrice] = parsePriceValue(right.price);
    if (leftPrice !== rightPrice) {
      return leftPrice - rightPrice;
    }
    return String(left.departure_date || "").localeCompare(String(right.departure_date || ""));
  });
  const overnightDays = entries.filter((entry) => entry.overnight);

  return {
    mode,
    solution_count: response.solutionCount,
    session: response.session,
    solution_set: response.solutionSet,
    min_price: sortedEntries[0]?.price ?? null,
    carriers: (response.itineraryCarrierList?.groups || [])
      .filter((group) => group && typeof group === "object")
      .map((group) => group.label?.code),
    best_options: sortedEntries.slice(0, limit),
    overnight_option_count: overnightDays.length,
    matrix_url: buildMatrixUrl(sitePayload),
  };
}

function buildSummary(sitePayload, response, limit) {
  if (response.solutionList) {
    return buildSpecificSummary(sitePayload, response, limit);
  }
  if (response.calendar || response.calendarOneWay) {
    return buildCalendarSummary(sitePayload, response, limit);
  }
  return {
    mode: "unknown",
    solution_count: response.solutionCount,
    matrix_url: buildMatrixUrl(sitePayload),
  };
}

function sortValue(value) {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortValue(value[key])]),
  );
}

function usage() {
  return [
    "Usage: node scripts/matrix_search.js [options]",
    "",
    "Options:",
    "  --payload-file <path>  Path to Matrix site payload JSON. If omitted, read stdin.",
    "  --limit <n>            Number of results to include in summary output. Default: 5.",
    `  --endpoint <url>       Matrix API endpoint. Default: ${DEFAULT_ENDPOINT}`,
    "  --raw                  Include the raw API response.",
    "  --show-request         Include the converted direct API request body.",
    "  --help                 Show this help.",
  ].join("\n");
}

function parseCliArgs(argv) {
  const args = {
    payloadFile: null,
    limit: 5,
    endpoint: DEFAULT_ENDPOINT,
    raw: false,
    showRequest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--payload-file":
        index += 1;
        args.payloadFile = argv[index];
        break;
      case "--limit":
        index += 1;
        args.limit = Number.parseInt(argv[index], 10);
        break;
      case "--endpoint":
        index += 1;
        args.endpoint = argv[index];
        break;
      case "--raw":
        args.raw = true;
        break;
      case "--show-request":
        args.showRequest = true;
        break;
      case "--help":
      case "-h":
        process.stdout.write(`${usage()}\n`);
        process.exit(0);
      default:
        if (!arg) {
          break;
        }
        throw new Error(`unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(args.limit) || args.limit < 1) {
    throw new Error("--limit must be a positive integer");
  }

  if (!args.endpoint) {
    throw new Error("--endpoint requires a value");
  }

  return args;
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const sitePayload = await loadPayload(args.payloadFile);
  const requestBody = await buildRequestBody(JSON.parse(JSON.stringify(sitePayload)));
  const response = await postJson(args.endpoint, requestBody);

  const output = {
    matrix_url: buildMatrixUrl(sitePayload),
    site_payload: sitePayload,
    summary: buildSummary(sitePayload, response, args.limit),
  };

  if (args.showRequest) {
    output.request_body = requestBody;
  }
  if (args.raw) {
    output.response = response;
  }

  process.stdout.write(`${JSON.stringify(sortValue(output), null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exit(1);
});
