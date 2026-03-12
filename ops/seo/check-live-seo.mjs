import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

function matchFirst(text, pattern) {
  const match = text.match(pattern);
  return match?.[1]?.trim() ?? "";
}

function countSitemapUrls(xmlText) {
  const matches = xmlText.match(/<url(\s|>)/gi);
  return matches ? matches.length : null;
}

async function fetchWithStatus(url) {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "user-agent": "guesthomebook-seo-monitor/1.0"
      }
    });

    const text = await response.text();

    return {
      status: response.status,
      content: text,
      error: null
    };
  } catch (error) {
    return {
      status: 0,
      content: "",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function checkLiveSeo({
  baseUrl = "https://www.guesthomebook.it",
  outputJsonPath = null
} = {}) {
  const cleanBaseUrl = normalizeBaseUrl(baseUrl);
  const homeUrl = `${cleanBaseUrl}/`;
  const robotsUrl = `${cleanBaseUrl}/robots.txt`;
  const sitemapUrl = `${cleanBaseUrl}/sitemap.xml`;

  const [home, robots, sitemap] = await Promise.all([
    fetchWithStatus(homeUrl),
    fetchWithStatus(robotsUrl),
    fetchWithStatus(sitemapUrl)
  ]);

  const report = {
    checked_at_utc: new Date().toISOString(),
    base_url: cleanBaseUrl,
    home_status: home.status,
    robots_status: robots.status,
    sitemap_status: sitemap.status,
    robots_has_sitemap: new RegExp(`Sitemap:\\s+${sitemapUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(robots.content),
    sitemap_url_count: countSitemapUrls(sitemap.content),
    homepage_title: matchFirst(home.content, /<title>([\s\S]*?)<\/title>/i),
    homepage_meta_description: matchFirst(
      home.content,
      /<meta[^>]*name=['"]description['"][^>]*content=['"]([^'"]*)['"][^>]*>/i
    ),
    homepage_canonical: matchFirst(home.content, /<link[^>]*rel=['"]canonical['"][^>]*href=['"]([^'"]*)['"][^>]*>/i),
    errors: {
      home: home.error,
      robots: robots.error,
      sitemap: sitemap.error
    }
  };

  if (outputJsonPath) {
    const fullPath = path.resolve(outputJsonPath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  return report;
}

function parseArgs(argv) {
  const args = {
    baseUrl: "https://www.guesthomebook.it",
    outputJsonPath: null
  };

  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--base-url" && argv[i + 1]) {
      args.baseUrl = argv[i + 1];
      i += 1;
    } else if (item === "--output-json" && argv[i + 1]) {
      args.outputJsonPath = argv[i + 1];
      i += 1;
    }
  }

  return args;
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const args = parseArgs(process.argv.slice(2));
  checkLiveSeo(args)
    .then((report) => {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    })
    .catch((error) => {
      console.error("seo_live_check_failed", error);
      process.exitCode = 1;
    });
}
