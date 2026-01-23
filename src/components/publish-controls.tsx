"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createBrowserSupabaseClient } from "../lib/supabase/client";

type PublishControlsProps = {
  homebookId: string;
  initialIsPublished: boolean;
};

export function PublishControls({ homebookId, initialIsPublished }: PublishControlsProps) {
  const [isPublished, setIsPublished] = useState(initialIsPublished);
  const [isPending, startTransition] = useTransition();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ homebookId?: string }>;
      if (custom.detail?.homebookId === homebookId) {
        setIsPublished(false);
      }
    };
    window.addEventListener("homebook:draft", handler);
    return () => window.removeEventListener("homebook:draft", handler);
  }, [homebookId]);

  const updatePublish = (next: boolean) => {
    startTransition(async () => {
      const { error } = await supabase.from("homebooks").update({ is_published: next }).eq("id", homebookId);
      if (!error) {
        setIsPublished(next);
      }
    });
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap"
      }}
    >
      <div>
        <div className="pill">{isPublished ? "Pubblicato" : "Bozza modifiche"}</div>
        <p className="text-muted" style={{ margin: "6px 0 0" }}>
          {isPublished
            ? "Se inizi a modificare, l'homebook passa in bozza finche non premi Salva e pubblica."
            : "Le modifiche non sono visibili agli ospiti finche non premi Salva e pubblica."}
        </p>
      </div>
      <button
        className="btn"
        type="button"
        onClick={() => updatePublish(!isPublished)}
        disabled={isPending}
      >
        {isPublished ? "Metti in bozza" : "Salva e pubblica"}
      </button>
    </div>
  );
}
