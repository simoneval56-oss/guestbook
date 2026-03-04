"use client";

import { useState } from "react";
import { ClassicoEditorPreview, type MediaItem, type Section, type Subsection } from "./classico-editor-preview";

type OwnerPreviewToggleProps = {
  sections: Section[];
  subsectionsBySection: Record<string, Subsection[]>;
  mediaByParent: Record<string, MediaItem[]>;
  layoutName: string;
  homebookId?: string;
  isPublished?: boolean;
  forceReadOnly?: boolean;
  forceReadOnlyReason?: string;
};

export function OwnerPreviewToggle({
  sections,
  subsectionsBySection,
  mediaByParent,
  layoutName,
  homebookId,
  isPublished,
  forceReadOnly = false,
  forceReadOnlyReason
}: OwnerPreviewToggleProps) {
  const [isGuestPreview, setIsGuestPreview] = useState(false);
  const effectiveReadOnly = forceReadOnly || isGuestPreview;

  return (
    <>
      <section className="card" style={{ marginBottom: 16 }}>
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
            <div className="pill">Anteprima</div>
            <p className="text-muted" style={{ margin: "6px 0 0" }}>
              Attiva la preview ospite per vedere la versione read-only.
            </p>
          </div>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={isGuestPreview}
              onChange={(event) => setIsGuestPreview(event.target.checked)}
              disabled={forceReadOnly}
            />
            <span style={{ fontWeight: 600 }}>Preview ospite</span>
          </label>
        </div>
      </section>
      {forceReadOnly ? (
        <section className="card" style={{ marginBottom: 16, borderColor: "#f5c2c7", background: "#fff5f5" }}>
          <div className="pill" style={{ background: "#fdecec", color: "#a12b2b" }}>
            Modifica disattivata
          </div>
          <p className="text-muted" style={{ margin: "8px 0 0", color: "#7a2b2b" }}>
            {forceReadOnlyReason ?? "Abbonamento non attivo: i contenuti sono in sola lettura."}
          </p>
        </section>
      ) : null}
      {isGuestPreview ? (
        <section className="card" style={{ marginBottom: 16, borderColor: "#f5c2c7", background: "#fff5f5" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div className="pill" style={{ background: "#fdecec", color: "#a12b2b" }}>Modalità anteprima</div>
              <p className="text-muted" style={{ margin: "6px 0 0", color: "#7a2b2b" }}>
                Stai visualizzando la preview ospite. Disattiva per modificare.
              </p>
            </div>
            <button className="btn btn-secondary" type="button" onClick={() => setIsGuestPreview(false)}>
              Disattiva anteprima
            </button>
          </div>
        </section>
      ) : null}
      <ClassicoEditorPreview
        sections={sections}
        subsectionsBySection={subsectionsBySection}
        mediaByParent={mediaByParent}
        layoutName={layoutName}
        readOnly={effectiveReadOnly}
        homebookId={homebookId}
        isPublished={isPublished}
        disableLiveMediaFetch
      />
    </>
  );
}
