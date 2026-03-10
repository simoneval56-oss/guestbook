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
    }
  ];
}
