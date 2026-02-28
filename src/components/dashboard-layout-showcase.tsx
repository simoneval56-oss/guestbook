"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { LayoutDefinition, LayoutId } from "../lib/layouts";

type Props = {
  layouts: LayoutDefinition[];
};

const PREVIEW_FALLBACKS: Record<LayoutId, { bg: string; accent: string }> = {
  classico: { bg: "linear-gradient(135deg, #f7f6f2 0%, #e8e1d5 100%)", accent: "#2f4f63" },
  moderno: { bg: "linear-gradient(135deg, #eef3f9 0%, #dde7f3 100%)", accent: "#1c3c63" },
  rustico: { bg: "linear-gradient(135deg, #f5efe7 0%, #dfcfba 100%)", accent: "#624124" },
  mediterraneo: { bg: "linear-gradient(135deg, #f2e8da 0%, #d2e5f2 100%)", accent: "#2f4f63" },
  pastello: { bg: "linear-gradient(135deg, #fee6ef 0%, #dff2ff 100%)", accent: "#6a3b64" },
  oro: { bg: "linear-gradient(135deg, #f8efd4 0%, #e6c88f 100%)", accent: "#634415" },
  illustrativo: { bg: "linear-gradient(135deg, #fff1df 0%, #f9d5a7 100%)", accent: "#b65700" },
  futuristico: { bg: "linear-gradient(135deg, #e7e3f8 0%, #c8c0eb 100%)", accent: "#362f66" },
  romantico: { bg: "linear-gradient(135deg, #ffe7ee 0%, #f4cedd 100%)", accent: "#7a3857" },
  notturno: { bg: "linear-gradient(135deg, #1a2441 0%, #2c3a65 100%)", accent: "#dfe8ff" }
};

export function DashboardLayoutShowcase({ layouts }: Props) {
  const [activeLayoutId, setActiveLayoutId] = useState<LayoutId | null>(null);
  const activeLayout = useMemo(
    () => (activeLayoutId ? layouts.find((layout) => layout.id === activeLayoutId) ?? null : null),
    [activeLayoutId, layouts]
  );

  return (
    <>
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        {layouts.map((layout) => {
          const fallback = PREVIEW_FALLBACKS[layout.id];
          return (
            <button
              key={layout.id}
              type="button"
              className="card"
              onClick={() => setActiveLayoutId(layout.id)}
              style={{
                textAlign: "left",
                padding: 12,
                display: "grid",
                gap: 10,
                border: "1px solid #d6e7ea",
                cursor: "pointer",
                minHeight: 220
              }}
            >
              <div
                style={{
                  borderRadius: 12,
                  overflow: "hidden",
                  border: "1px solid rgba(14, 75, 88, 0.2)",
                  minHeight: 120,
                  background: fallback.bg,
                  position: "relative"
                }}
              >
                {layout.thumbnail ? (
                  <Image
                    src={layout.thumbnail}
                    alt={`Anteprima ${layout.name}`}
                    fill
                    sizes="(max-width: 900px) 100vw, 240px"
                    style={{ objectFit: "cover" }}
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "grid",
                      placeItems: "center",
                      color: fallback.accent,
                      fontWeight: 700,
                      letterSpacing: "0.04em"
                    }}
                  >
                    {layout.name}
                  </div>
                )}
              </div>
              <div className="pill" style={{ width: "fit-content", margin: 0 }}>
                {layout.name}
              </div>
              <div className="text-muted" style={{ fontSize: 13, lineHeight: 1.45 }}>
                {layout.description}
              </div>
            </button>
          );
        })}
      </div>

      {activeLayout ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Anteprima layout ${activeLayout.name}`}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(11, 30, 33, 0.52)",
            zIndex: 1200,
            display: "grid",
            placeItems: "center",
            padding: 16
          }}
          onClick={() => setActiveLayoutId(null)}
        >
          <div
            className="card"
            style={{ width: "min(760px, 100%)", padding: 16, display: "grid", gap: 12 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
              <div>
                <div className="pill" style={{ marginBottom: 8 }}>
                  Anteprima parziale
                </div>
                <h3 style={{ margin: 0, color: "#0e4b58" }}>{activeLayout.name}</h3>
                <div className="text-muted" style={{ marginTop: 6 }}>
                  {activeLayout.description}
                </div>
              </div>
              <button type="button" className="btn btn-secondary" onClick={() => setActiveLayoutId(null)}>
                Chiudi
              </button>
            </div>

            <div
              style={{
                borderRadius: 14,
                overflow: "hidden",
                border: "1px solid rgba(14, 75, 88, 0.22)",
                minHeight: 280,
                position: "relative",
                background: PREVIEW_FALLBACKS[activeLayout.id].bg
              }}
            >
              {activeLayout.thumbnail ? (
                <Image
                  src={activeLayout.thumbnail}
                  alt={`Preview layout ${activeLayout.name}`}
                  fill
                  sizes="(max-width: 900px) 100vw, 760px"
                  style={{ objectFit: "cover" }}
                />
              ) : (
                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "grid",
                    placeItems: "center",
                    color: PREVIEW_FALLBACKS[activeLayout.id].accent,
                    fontSize: "clamp(22px, 4vw, 36px)",
                    fontWeight: 700
                  }}
                >
                  {activeLayout.name}
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div className="text-muted" style={{ fontSize: 13 }}>
                Preview orientativa per aiutarti nella scelta dello stile.
              </div>
              <Link href="/homebooks/new" className="btn">
                Crea un homebook
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
