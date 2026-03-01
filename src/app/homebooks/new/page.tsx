import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "../../../lib/supabase/server";
import { LayoutCard } from "../../../components/layout-card";
import { DEFAULT_LAYOUT_ID, LAYOUTS } from "../../../lib/layouts";
import { getDefaultSections } from "../../../lib/default-sections";
import { Database } from "../../../lib/database.types";
import { generatePublicAccessToken } from "../../../lib/homebook-access";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type NewHomebookPageProps = {
  searchParams?: Promise<{ layout?: string | string[] }>;
};

async function createHomebook(formData: FormData) {
  "use server";
  const supabase = createServerSupabaseClient() as any;
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  const property_id = formData.get("property_id")?.toString() ?? "";
  const title = formData.get("title")?.toString() ?? "";
  const layout_type = formData.get("layout_type")?.toString() || DEFAULT_LAYOUT_ID;
  if (!property_id || !title) return;
  const public_slug = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  const public_access_token = generatePublicAccessToken();
  const homebookPayload: Database["public"]["Tables"]["homebooks"]["Insert"] = {
    property_id,
    title,
    layout_type,
    public_slug,
    public_access_token,
    public_access_enabled: true,
    is_published: false
  };
  const { data, error } = await (supabase
    .from("homebooks") as any)
    .insert(homebookPayload)
    .select("id")
    .single();
  if (!error && data?.id) {
    const defaultSections: Database["public"]["Tables"]["sections"]["Insert"][] = getDefaultSections(layout_type).map((section) => ({
      ...section,
      homebook_id: data.id
    }));
    if (defaultSections.length) {
      await (supabase.from("sections") as any).insert(defaultSections);
    }
    redirect(`/homebooks/${data.id}/edit`);
  }
  revalidatePath("/dashboard");
}

export default async function NewHomebookPage({ searchParams }: NewHomebookPageProps) {
  const supabase = createServerSupabaseClient() as any;
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedLayoutRaw = resolvedSearchParams?.layout;
  const requestedLayout = Array.isArray(requestedLayoutRaw) ? requestedLayoutRaw[0] : requestedLayoutRaw;
  const normalizedRequestedLayout = typeof requestedLayout === "string" ? requestedLayout.trim().toLowerCase() : "";
  const isValidRequestedLayout = LAYOUTS.some((layout) => layout.id === normalizedRequestedLayout);
  const selectedLayout = isValidRequestedLayout ? normalizedRequestedLayout : DEFAULT_LAYOUT_ID;
  const { data: properties } = await supabase.from("properties").select("id, name");

  return (
    <div className="grid" style={{ gap: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between" }}>
        <Link href="/dashboard">{"\u2190 Dashboard"}</Link>
        <div className="pill">Seleziona layout e struttura</div>
      </header>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        {LAYOUTS.map((option) => (
          <LayoutCard
            key={option.id}
            name={option.name}
            description={option.description}
            href={`/homebooks/new?layout=${encodeURIComponent(option.id)}#creator`}
          />
        ))}
      </div>
      <section id="creator" className="card">
        <form action={createHomebook} className="grid" style={{ gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
            <input name="title" placeholder="Titolo homebook" required className="input" />
            <select name="layout_type" className="input" defaultValue={selectedLayout}>
              {LAYOUTS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
            <select name="property_id" className="input" defaultValue="" required>
              <option value="" disabled>
                Seleziona struttura
              </option>
              {(properties ?? []).map((property: Database["public"]["Tables"]["properties"]["Row"]) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </select>
          </div>
          <button className="btn" type="submit">
            Crea e vai all&apos;editor
          </button>
        </form>
      </section>
    </div>
  );
}



