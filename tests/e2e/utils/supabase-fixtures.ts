import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { E2EFixture, E2EOwnerFixture } from "./fixture-store";
import { getSupabaseEnv } from "./env";

function createAdminClient() {
  const { url, serviceRoleKey } = getSupabaseEnv();
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }) as any;
}

function buildRunId() {
  return `${Date.now().toString(36)}-${randomUUID().replace(/-/g, "").slice(0, 10)}`;
}

function buildToken() {
  return randomUUID().replace(/-/g, "");
}

async function createOwnerFixture(
  admin: ReturnType<typeof createAdminClient>,
  label: "A" | "B",
  runId: string
): Promise<E2EOwnerFixture> {
  const email = `e2e-owner-${label.toLowerCase()}-${runId}@example.com`;
  const password = `E2E-${runId.slice(0, 8)}-Pass!1`;

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });
  if (authError || !authData.user) {
    throw new Error(`Failed creating auth user ${label}: ${authError?.message ?? "unknown"}`);
  }
  const userId = authData.user.id;

  const { error: userError } = await admin.from("users").upsert({
    id: userId,
    email,
    subscription_status: "active",
    plan_type: "starter"
  });
  if (userError) {
    throw new Error(`Failed inserting users row ${label}: ${userError.message}`);
  }

  const propertyName = `E2E Property ${label} ${runId}`;
  const { data: property, error: propertyError } = await admin
    .from("properties")
    .insert({
      user_id: userId,
      name: propertyName,
      address: `Via Test ${label} ${runId}`,
      short_description: `Descrizione struttura ${label} ${runId}`
    })
    .select("id, name")
    .single();
  if (propertyError || !property) {
    throw new Error(`Failed creating property ${label}: ${propertyError?.message ?? "unknown"}`);
  }

  const homebookTitle = `E2E Homebook ${label} ${runId}`;
  const publicSlug = `e2e-${label.toLowerCase()}-${runId}`.slice(0, 40);
  const publicToken = buildToken();
  const { data: homebook, error: homebookError } = await admin
    .from("homebooks")
    .insert({
      property_id: property.id,
      title: homebookTitle,
      layout_type: "classico",
      public_slug: publicSlug,
      public_access_token: publicToken,
      public_access_enabled: true,
      is_published: true
    })
    .select("id")
    .single();
  if (homebookError || !homebook) {
    throw new Error(`Failed creating homebook ${label}: ${homebookError?.message ?? "unknown"}`);
  }

  const { data: section, error: sectionError } = await admin
    .from("sections")
    .insert({
      homebook_id: homebook.id,
      title: "Check-in",
      order_index: 1,
      visible: true
    })
    .select("id")
    .single();
  if (sectionError || !section) {
    throw new Error(`Failed creating section ${label}: ${sectionError?.message ?? "unknown"}`);
  }

  const { error: subError } = await admin.from("subsections").insert({
    section_id: section.id,
    content_text: JSON.stringify({
      title: "Orario",
      body: "Check-in dalle 15:00 alle 20:00"
    }),
    visible: true,
    order_index: 1
  });
  if (subError) {
    throw new Error(`Failed creating subsection ${label}: ${subError.message}`);
  }

  return {
    email,
    password,
    userId,
    propertyId: property.id,
    propertyName: property.name,
    homebookId: homebook.id,
    homebookTitle,
    publicSlug,
    publicToken
  };
}

export async function createE2EFixture() {
  const admin = createAdminClient();
  const runId = buildRunId();
  const ownerA = await createOwnerFixture(admin, "A", runId);
  const ownerB = await createOwnerFixture(admin, "B", runId);

  return {
    runId,
    ownerA,
    ownerB
  } satisfies E2EFixture;
}

export async function destroyE2EFixture(fixture: E2EFixture) {
  const admin = createAdminClient();
  for (const owner of [fixture.ownerA, fixture.ownerB]) {
    try {
      await admin.auth.admin.deleteUser(owner.userId);
    } catch {
      // ignore cleanup errors
    }
  }
}

export async function getHomebookPublishedState(homebookId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("homebooks")
    .select("is_published")
    .eq("id", homebookId)
    .single();
  if (error || !data) {
    throw new Error(`Unable to read homebook ${homebookId}: ${error?.message ?? "not found"}`);
  }
  return Boolean(data.is_published);
}
