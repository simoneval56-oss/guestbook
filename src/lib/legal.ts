import type { Metadata } from "next";
import { getSiteUrl } from "./site-url";
import { TRIAL_DURATION_DAYS } from "./subscription";

export const LEGAL_BRAND_NAME = "GuestHomeBook";
export const LEGAL_CONTACT_EMAIL = "info@guesthomebook.it";
export const LEGAL_CONTACT_MAILTO = `mailto:${LEGAL_CONTACT_EMAIL}`;
export const LEGAL_LAST_UPDATED_ISO = "2026-03-13";
export const LEGAL_LAST_UPDATED_LABEL = "13 marzo 2026";
export const LEGAL_TERMS_VERSION = LEGAL_LAST_UPDATED_ISO;
export const LEGAL_PRIVACY_VERSION = LEGAL_LAST_UPDATED_ISO;
export const LEGAL_TRIAL_DAYS = TRIAL_DURATION_DAYS;
export const LEGAL_ACCEPTANCE_SOURCE_REGISTER = "register";

export const LEGAL_PRICE_SUMMARY = [
  {
    label: "1-5 strutture",
    value: "EUR 9,90/mese"
  },
  {
    label: "6-10 strutture",
    value: "EUR 17,90/mese"
  },
  {
    label: "Dalla 11a struttura",
    value: "EUR 2,40/mese per ogni struttura extra oltre la decima"
  }
] as const;

export function buildLegalMetadata(title: string, path: string, description: string): Metadata {
  const siteUrl = getSiteUrl();

  return {
    title,
    description,
    metadataBase: new URL(siteUrl),
    alternates: {
      canonical: path
    }
  };
}

export function buildLegalAcceptanceFields(acceptedAt = new Date().toISOString()) {
  return {
    terms_version: LEGAL_TERMS_VERSION,
    privacy_version: LEGAL_PRIVACY_VERSION,
    terms_accepted_at: acceptedAt,
    privacy_accepted_at: acceptedAt,
    legal_acceptance_source: LEGAL_ACCEPTANCE_SOURCE_REGISTER
  };
}
