#!/usr/bin/env node
const { Client } = require("pg");

const EXPECTED_POLICIES = [
  {
    schema: "public",
    table: "properties",
    policies: ["allow_service_role", "properties_owner", "properties_public_view"]
  },
  {
    schema: "public",
    table: "homebooks",
    policies: ["allow_service_role_homebooks", "homebooks_owner", "homebooks_public"]
  },
  {
    schema: "public",
    table: "sections",
    policies: ["allow_service_role", "sections_owner", "sections_public_view"]
  },
  {
    schema: "public",
    table: "subsections",
    policies: ["allow_service_role", "subsections_owner", "subsections_public_view"]
  },
  {
    schema: "public",
    table: "media",
    policies: ["allow_service_role", "media_owner", "media_public"]
  },
  {
    schema: "public",
    table: "users",
    policies: ["allow_service_role", "users_owner", "users_read_own"]
  },
  {
    schema: "storage",
    table: "objects",
    policies: ["storage_service_role", "storage_authenticated_owner", "storage_public_read"]
  },
  {
    schema: "storage",
    table: "buckets",
    policies: ["storage_service_role", "storage_authenticated_owner", "storage_public_read"]
  }
];

async function run() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.error("Set SUPABASE_DB_URL to the Postgres connection string (service role).");
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();

  const results = [];
  for (const { schema, table, policies } of EXPECTED_POLICIES) {
    const res = await client.query(
      `SELECT policyname FROM pg_policies WHERE schemaname = $1 AND tablename = $2`,
      [schema, table]
    );
    const names = res.rows.map((row) => row.policyname);
    const missing = policies.filter((policy) => !names.includes(policy));
    results.push({ schema, table, missing, found: names });
  }

  await client.end();
  let failed = false;
  for (const { schema, table, missing, found } of results) {
    if (missing.length) {
      failed = true;
      console.error(
        `${schema}.${table} missing policies: ${missing.join(", ")} (found: ${found.join(", ")})`
      );
    } else {
      console.log(`${schema}.${table} ✅ all policies present (${found.join(", ")})`);
    }
  }

  if (failed) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
