import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkLiveSeo } from "./check-live-seo.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_TRACKER_PATH = path.join(SCRIPT_DIR, "seo-weekly-tracker.csv");
const DEFAULT_LIVE_JSON_PATH = path.join(SCRIPT_DIR, "live-seo-latest.json");
const DEFAULT_BASE_URL = "https://www.guesthomebook.it";
const DEFAULT_BRAND_TERMS = ["guesthomebook", "guest homebook", "guesthomebook.it"];
const CSV_COLUMNS = [
  "check_date",
  "period_label",
  "pages_indexed",
  "pages_excluded",
  "total_pages_known",
  "excluded_crawled_not_indexed",
  "excluded_noindex",
  "excluded_duplicate",
  "brand_clicks",
  "brand_impressions",
  "brand_ctr_pct",
  "brand_avg_position",
  "home_status",
  "robots_status",
  "sitemap_status",
  "sitemap_url_count",
  "notes",
  "actions"
];

function formatDateYYYYMMDD(date) {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getIsoWeekLabel(dateInput) {
  const date = new Date(Date.UTC(dateInput.getUTCFullYear(), dateInput.getUTCMonth(), dateInput.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `week-${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function toCsvLine(fields) {
  return fields
    .map((value) => {
      const text = value == null ? "" : String(value);
      if (text.includes(",") || text.includes('"') || text.includes("\n")) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    })
    .join(",");
}

async function readCsv(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const lines = raw.replace(/\r\n/g, "\n").split("\n").filter((line) => line.length > 0);
  if (lines.length === 0) {
    throw new Error(`CSV vuoto: ${filePath}`);
  }
  const header = parseCsvLine(lines[0].replace(/^\uFEFF/, ""));
  const rows = lines.slice(1).map((line) => parseCsvLine(line));
  return { header, rows };
}

async function writeCsv(filePath, header, rows) {
  const content = [toCsvLine(header), ...rows.map((row) => toCsvLine(row))].join("\n");
  await fs.writeFile(filePath, `${content}\n`, "utf8");
}

function buildRowObjectFromArray(header, rowArray) {
  const normalizedRow = normalizeRow(header, rowArray);
  const map = {};
  header.forEach((column, index) => {
    map[column] = normalizedRow[index] ?? "";
  });
  return map;
}

function normalizeRow(header, rowArray) {
  if (rowArray.length === header.length) {
    return rowArray;
  }

  const isExpectedSeoHeader =
    header[0] === "check_date" &&
    header[1] === "period_label" &&
    header[header.length - 6] === "home_status" &&
    header[header.length - 1] === "actions";

  if (!isExpectedSeoHeader || rowArray.length < 2) {
    const padded = [...rowArray];
    while (padded.length < header.length) {
      padded.push("");
    }
    return padded.slice(0, header.length);
  }

  const prefixCount = 2;
  const suffixCount = 6;
  if (rowArray.length < prefixCount + suffixCount) {
    const padded = [...rowArray];
    while (padded.length < header.length) {
      padded.push("");
    }
    return padded.slice(0, header.length);
  }

  const normalized = new Array(header.length).fill("");

  for (let i = 0; i < prefixCount; i += 1) {
    normalized[i] = rowArray[i] ?? "";
  }

  const suffixValues = rowArray.slice(-suffixCount);
  for (let i = 0; i < suffixCount; i += 1) {
    normalized[header.length - suffixCount + i] = suffixValues[i] ?? "";
  }

  const middleValues = rowArray.slice(prefixCount, rowArray.length - suffixCount);
  const middleHeaderCount = header.length - prefixCount - suffixCount;
  for (let i = 0; i < Math.min(middleValues.length, middleHeaderCount); i += 1) {
    normalized[prefixCount + i] = middleValues[i] ?? "";
  }

  return normalized;
}

function toRowArray(header, rowObject) {
  return header.map((column) => rowObject[column] ?? "");
}

function getCredentialsFromEnv() {
  const rawJson = process.env.GSC_SERVICE_ACCOUNT_JSON?.trim();
  if (rawJson) {
    return JSON.parse(rawJson);
  }

  const b64 = process.env.GSC_SERVICE_ACCOUNT_JSON_B64?.trim();
  if (b64) {
    const decoded = Buffer.from(b64, "base64").toString("utf8");
    return JSON.parse(decoded);
  }

  return null;
}

function b64url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createServiceAccountJwt({ clientEmail, privateKey, scope }) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  };
  const encodedHeader = b64url(JSON.stringify(header));
  const encodedPayload = b64url(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(data);
  signer.end();
  const signature = signer.sign(privateKey, "base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

  return `${data}.${signature}`;
}

async function getGoogleAccessToken(credentials) {
  const clientEmail = String(credentials.client_email ?? "").trim();
  const privateKey = String(credentials.private_key ?? "").trim();
  if (!clientEmail || !privateKey) {
    throw new Error("Invalid service account JSON: client_email/private_key missing.");
  }

  const jwt = createServiceAccountJwt({
    clientEmail,
    privateKey,
    scope: "https://www.googleapis.com/auth/webmasters.readonly"
  });

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });

  const tokenPayload = await tokenResponse.json();
  if (!tokenResponse.ok) {
    throw new Error(`Google token error (${tokenResponse.status}): ${JSON.stringify(tokenPayload)}`);
  }

  return String(tokenPayload.access_token ?? "");
}

async function querySearchAnalytics({ accessToken, siteUrl, startDate, endDate }) {
  const endpoint = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      startDate,
      endDate,
      dimensions: ["query"],
      rowLimit: 5000
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Search Console API error (${response.status}): ${JSON.stringify(payload)}`);
  }
  return payload.rows ?? [];
}

function aggregateBrandMetrics(rows, terms) {
  const normalizedTerms = terms.map((term) => term.toLowerCase());
  let totalClicks = 0;
  let totalImpressions = 0;
  let weightedPosition = 0;

  for (const row of rows) {
    const query = String(row.keys?.[0] ?? "").toLowerCase();
    if (!query) {
      continue;
    }
    if (!normalizedTerms.some((term) => query.includes(term))) {
      continue;
    }

    const clicks = Number(row.clicks ?? 0);
    const impressions = Number(row.impressions ?? 0);
    const position = Number(row.position ?? 0);

    totalClicks += clicks;
    totalImpressions += impressions;
    weightedPosition += position * impressions;
  }

  const ctrPct = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const avgPosition = totalImpressions > 0 ? weightedPosition / totalImpressions : 0;

  return {
    clicks: totalClicks,
    impressions: totalImpressions,
    ctrPct,
    avgPosition
  };
}

async function fetchBrandMetrics({ siteUrl, terms, startDate, endDate }) {
  const credentials = getCredentialsFromEnv();
  if (!credentials) {
    return {
      available: false,
      error: "Missing credentials: set GSC_SERVICE_ACCOUNT_JSON or GSC_SERVICE_ACCOUNT_JSON_B64."
    };
  }

  try {
    const accessToken = await getGoogleAccessToken(credentials);
    const rows = await querySearchAnalytics({ accessToken, siteUrl, startDate, endDate });
    const aggregate = aggregateBrandMetrics(rows, terms);
    return {
      available: true,
      error: null,
      ...aggregate
    };
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function mergeNotes(existing, additions) {
  const parts = [];
  const base = (existing ?? "").trim();
  if (base) {
    parts.push(base);
  }
  for (const item of additions) {
    const normalized = item.trim();
    if (!normalized) {
      continue;
    }
    if (!parts.includes(normalized)) {
      parts.push(normalized);
    }
  }
  return parts.join(" | ");
}

function deriveAutoActions({ live, brandAvailable }) {
  const actions = [];
  if (live.home_status !== 200 || live.robots_status !== 200 || live.sitemap_status !== 200) {
    actions.push("Priorita alta: fix endpoint SEO non 200 e rieseguire check.");
  }
  if (!live.robots_has_sitemap) {
    actions.push("Aggiungere sitemap in robots.txt.");
  }
  if (!brandAvailable) {
    actions.push("Completare setup credenziali Search Console API.");
  }
  if (actions.length === 0) {
    actions.push("Nessuna azione urgente.");
  }
  return actions.join(" ");
}

function parseTerms(envValue) {
  if (!envValue?.trim()) {
    return [...DEFAULT_BRAND_TERMS];
  }
  return envValue
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseArgs(argv) {
  const options = {
    trackerPath: DEFAULT_TRACKER_PATH,
    liveJsonPath: DEFAULT_LIVE_JSON_PATH,
    baseUrl: process.env.SEO_BASE_URL || DEFAULT_BASE_URL,
    siteUrl: process.env.GSC_SITE_URL || "sc-domain:guesthomebook.it",
    brandTerms: parseTerms(process.env.SEO_BRAND_TERMS || "")
  };

  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--tracker" && argv[i + 1]) {
      options.trackerPath = path.resolve(argv[i + 1]);
      i += 1;
    } else if (item === "--live-json" && argv[i + 1]) {
      options.liveJsonPath = path.resolve(argv[i + 1]);
      i += 1;
    } else if (item === "--base-url" && argv[i + 1]) {
      options.baseUrl = argv[i + 1];
      i += 1;
    } else if (item === "--site-url" && argv[i + 1]) {
      options.siteUrl = argv[i + 1];
      i += 1;
    } else if (item === "--brand-terms" && argv[i + 1]) {
      options.brandTerms = parseTerms(argv[i + 1]);
      i += 1;
    }
  }

  return options;
}

async function run(options) {
  const now = new Date();
  const endDateRef = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const startDateRef = new Date(Date.UTC(endDateRef.getUTCFullYear(), endDateRef.getUTCMonth(), endDateRef.getUTCDate() - 6));
  const startDate = formatDateYYYYMMDD(startDateRef);
  const endDate = formatDateYYYYMMDD(endDateRef);
  const checkDate = formatDateYYYYMMDD(now);
  const periodLabel = getIsoWeekLabel(now);

  const [live, brand] = await Promise.all([
    checkLiveSeo({
      baseUrl: options.baseUrl,
      outputJsonPath: options.liveJsonPath
    }),
    fetchBrandMetrics({
      siteUrl: options.siteUrl,
      terms: options.brandTerms,
      startDate,
      endDate
    })
  ]);

  const { header, rows } = await readCsv(options.trackerPath);
  const effectiveHeader = CSV_COLUMNS.every((column) => header.includes(column)) ? header : CSV_COLUMNS;

  const rowIndex = rows.findIndex((row) => {
    const rowObject = buildRowObjectFromArray(header, row);
    return rowObject.check_date === checkDate;
  });

  const existing = rowIndex >= 0 ? buildRowObjectFromArray(header, rows[rowIndex]) : {};

  const updated = {
    ...existing,
    check_date: checkDate,
    period_label: periodLabel,
    brand_clicks: brand.available ? String(Math.round(brand.clicks)) : existing.brand_clicks ?? "",
    brand_impressions: brand.available ? String(Math.round(brand.impressions)) : existing.brand_impressions ?? "",
    brand_ctr_pct: brand.available ? brand.ctrPct.toFixed(2) : existing.brand_ctr_pct ?? "",
    brand_avg_position: brand.available ? brand.avgPosition.toFixed(2) : existing.brand_avg_position ?? "",
    home_status: String(live.home_status ?? ""),
    robots_status: String(live.robots_status ?? ""),
    sitemap_status: String(live.sitemap_status ?? ""),
    sitemap_url_count: live.sitemap_url_count == null ? "" : String(live.sitemap_url_count),
    notes: mergeNotes(existing.notes, [
      `Auto-check ${startDate}..${endDate}`,
      brand.available ? "Brand metrics aggiornate da Search Console API." : `Brand metrics non disponibili: ${brand.error}`,
      "Copertura indicizzazione (pagine indicizzate/escluse) non disponibile via API: compilare da UI Search Console."
    ]),
    actions: mergeNotes(existing.actions, [deriveAutoActions({ live, brandAvailable: brand.available })])
  };

  const updatedArray = toRowArray(effectiveHeader, updated);

  if (rowIndex >= 0) {
    rows[rowIndex] = updatedArray;
  } else {
    rows.push(updatedArray);
  }

  await fs.mkdir(path.dirname(options.trackerPath), { recursive: true });
  await writeCsv(options.trackerPath, effectiveHeader, rows);

  const output = {
    ok: true,
    tracker: options.trackerPath,
    live_json: options.liveJsonPath,
    row_date: checkDate,
    period_label: periodLabel,
    gsc_site: options.siteUrl,
    brand_terms: options.brandTerms,
    brand_metrics: brand,
    live_metrics: {
      home_status: live.home_status,
      robots_status: live.robots_status,
      sitemap_status: live.sitemap_status,
      sitemap_url_count: live.sitemap_url_count
    }
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const options = parseArgs(process.argv.slice(2));
  run(options).catch((error) => {
    console.error("seo_weekly_monitor_failed", error);
    process.exitCode = 1;
  });
}
