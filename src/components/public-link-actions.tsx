"use client";

import Image from "next/image";
import { useState } from "react";

type PublicLinkActionsProps = {
  url: string;
  isEnabled: boolean;
  isPublished: boolean;
  homebookId: string;
  rotateAction: (formData: FormData) => void | Promise<void>;
  toggleAction: (formData: FormData) => void | Promise<void>;
};

export function PublicLinkActions({
  url,
  isEnabled,
  isPublished,
  homebookId,
  rotateAction,
  toggleAction
}: PublicLinkActionsProps) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const canShare = Boolean(url) && isEnabled && isPublished;

  const handleCopy = async () => {
    if (!canShare) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const qrSrc = url
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}`
    : "";
  const tooltipCopy = "Copia negli appunti il link pubblico con token da inviare agli ospiti.";
  const tooltipQr = showQr
    ? "Nasconde il QR code del link pubblico."
    : "Mostra un QR code del link pubblico per condivisione rapida.";
  const tooltipRotate = "Genera un nuovo token: il vecchio link non funziona più.";
  const tooltipToggle = isEnabled
    ? "Blocca l'accesso ospiti anche con il link pubblico."
    : "Riabilita l'accesso pubblico con il link.";
  const tooltipBaseId = `homebook-${homebookId}`;
  const tooltipCopyId = `${tooltipBaseId}-copy-tooltip`;
  const tooltipQrId = `${tooltipBaseId}-qr-tooltip`;
  const tooltipRotateId = `${tooltipBaseId}-rotate-tooltip`;
  const tooltipToggleId = `${tooltipBaseId}-toggle-tooltip`;
  const statusMessage = !url
    ? "Link non disponibile. Rigenera per crearne uno."
    : !isEnabled
    ? "Accesso ospiti disattivato."
    : !isPublished
    ? "Pubblica per rendere accessibile il link."
    : "";

  return (
    <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <div className="tooltip-wrap">
          <button type="button" className="btn btn-secondary" onClick={handleCopy} disabled={!canShare} aria-describedby={tooltipCopyId}>
            {copied ? "Copiato" : "Copia link"}
          </button>
          <span className="tooltip-bubble" role="tooltip" id={tooltipCopyId}>
            {tooltipCopy}
          </span>
        </div>
        <div className="tooltip-wrap">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowQr((prev) => !prev)}
            disabled={!canShare}
            aria-describedby={tooltipQrId}
          >
            {showQr ? "Nascondi QR" : "Mostra QR"}
          </button>
          <span className="tooltip-bubble" role="tooltip" id={tooltipQrId}>
            {tooltipQr}
          </span>
        </div>
        <form action={rotateAction} className="tooltip-wrap">
          <input type="hidden" name="homebook_id" value={homebookId} />
          <button type="submit" className="btn btn-secondary" aria-describedby={tooltipRotateId}>
            Rigenera link
          </button>
          <span className="tooltip-bubble" role="tooltip" id={tooltipRotateId}>
            {tooltipRotate}
          </span>
        </form>
        <form action={toggleAction} className="tooltip-wrap">
          <input type="hidden" name="homebook_id" value={homebookId} />
          <input type="hidden" name="public_access_enabled" value={String(!isEnabled)} />
          <button type="submit" className="btn btn-secondary" aria-describedby={tooltipToggleId}>
            {isEnabled ? "Disattiva accesso" : "Attiva accesso"}
          </button>
          <span className="tooltip-bubble" role="tooltip" id={tooltipToggleId}>
            {tooltipToggle}
          </span>
        </form>
      </div>
      {statusMessage ? <div className="text-muted">{statusMessage}</div> : null}
      {showQr && canShare ? (
        <div
          style={{
            width: 220,
            height: 220,
            borderRadius: 12,
            border: "1px solid rgba(19, 84, 90, 0.2)",
            background: "#fff",
            display: "grid",
            placeItems: "center",
            padding: 8
          }}
        >
          <Image src={qrSrc} alt="QR link pubblico" width={204} height={204} unoptimized />
        </div>
      ) : null}
    </div>
  );
}
