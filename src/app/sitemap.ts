import type { MetadataRoute } from "next";
import { getSiteUrl } from "../lib/site-url";

const siteUrl = getSiteUrl();

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  return [
    {
      url: `${siteUrl}/`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 1.0
    },
    {
      url: `${siteUrl}/demo/oro`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.75
    },
    {
      url: `${siteUrl}/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.4
    },
    {
      url: `${siteUrl}/cookie`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.4
    },
    {
      url: `${siteUrl}/termini`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.45
    },
    {
      url: `${siteUrl}/recesso`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.45
    }
  ];
}
