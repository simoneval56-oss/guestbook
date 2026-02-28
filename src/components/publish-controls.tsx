"use client";

import { useEffect, useState, useTransition } from "react";

type PublishChecklistItem = {
  id: string;
  message: string;
};

type PublishMutationAction = "publish" | "draft" | "restore_latest_published";

type PublishControlsProps = {
  homebookId: string;
  initialIsPublished: boolean;
};

const DISMISS_KEY_PREFIX = "homebook:publish-checklist:dismiss:";

function getDismissKey(homebookId: string) {
  return `${DISMISS_KEY_PREFIX}${homebookId}`;
}

export function PublishControls({ homebookId, initialIsPublished }: PublishControlsProps) {
  const [isPublished, setIsPublished] = useState(initialIsPublished);
  const [isChecklistLoading, setIsChecklistLoading] = useState(false);
  const [showChecklistPrompt, setShowChecklistPrompt] = useState(false);
  const [showRestorePrompt, setShowRestorePrompt] = useState(false);
  const [checklistItems, setChecklistItems] = useState<PublishChecklistItem[]>([]);
  const [skipChecklistForHomebook, setSkipChecklistForHomebook] = useState(false);
  const [dismissChoice, setDismissChoice] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const shouldSkip = window.localStorage.getItem(getDismissKey(homebookId)) === "1";
    setSkipChecklistForHomebook(shouldSkip);
    setDismissChoice(shouldSkip);
  }, [homebookId]);

  const callPublishAction = async (action: PublishMutationAction) => {
    const response = await fetch(`/api/homebooks/${homebookId}/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ action })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error ?? "publish_action_failed");
    }
    return payload?.data ?? null;
  };

  const mapActionError = (action: PublishMutationAction, rawMessage: string) => {
    if (action === "restore_latest_published" && rawMessage === "no_published_version_snapshot") {
      return "Non esiste ancora una versione pubblicata da ripristinare.";
    }
    if (action === "restore_latest_published") {
      return "Ripristino non riuscito. Riprova tra poco.";
    }
    if (action === "publish") {
      return "Errore tecnico durante la pubblicazione. Riprova.";
    }
    return "Errore tecnico durante l'aggiornamento dello stato pubblicazione. Riprova.";
  };

  const runPublishAction = (action: PublishMutationAction) => {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        await callPublishAction(action);
        setIsPublished(action !== "draft");
        if (action === "restore_latest_published") {
          setShowRestorePrompt(false);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "publish_action_failed";
        setErrorMessage(mapActionError(action, message));
      }
    });
  };

  const loadChecklistSuggestions = async () => {
    const response = await fetch(`/api/homebooks/${homebookId}/publish-checklist`, {
      cache: "no-store"
    });
    if (!response.ok) {
      throw new Error("checklist_request_failed");
    }
    const payload = await response.json();
    const suggestions = Array.isArray(payload?.data?.suggestions)
      ? (payload.data.suggestions as PublishChecklistItem[])
      : [];
    return suggestions;
  };

  const handleTogglePublish = async () => {
    if (isPublished) {
      runPublishAction("draft");
      return;
    }

    if (skipChecklistForHomebook) {
      runPublishAction("publish");
      return;
    }

    setErrorMessage(null);
    setIsChecklistLoading(true);
    try {
      const suggestions = await loadChecklistSuggestions();
      if (!suggestions.length) {
        runPublishAction("publish");
        return;
      }
      setDismissChoice(skipChecklistForHomebook);
      setChecklistItems(suggestions);
      setShowChecklistPrompt(true);
    } catch {
      setErrorMessage("Impossibile controllare i suggerimenti di pubblicazione. Riprova tra poco.");
    } finally {
      setIsChecklistLoading(false);
    }
  };

  const confirmPublishAnyway = () => {
    if (typeof window !== "undefined") {
      const key = getDismissKey(homebookId);
      if (dismissChoice) {
        window.localStorage.setItem(key, "1");
        setSkipChecklistForHomebook(true);
      } else {
        window.localStorage.removeItem(key);
        setSkipChecklistForHomebook(false);
      }
    }
    setShowChecklistPrompt(false);
    runPublishAction("publish");
  };

  const reEnableChecklistPrompt = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(getDismissKey(homebookId));
    }
    setSkipChecklistForHomebook(false);
    setDismissChoice(false);
  };

  const confirmRestoreLatestPublished = () => {
    runPublishAction("restore_latest_published");
  };

  const isBusy = isPending || isChecklistLoading;

  return (
    <>
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
          {!isPublished ? (
            <p className="text-muted" style={{ margin: "6px 0 0", fontSize: 13 }}>
              Prima della pubblicazione mostriamo suggerimenti non obbligatori.
            </p>
          ) : null}
          {!isPublished && skipChecklistForHomebook ? (
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                onClick={reEnableChecklistPrompt}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "#0e4b58",
                  padding: 0,
                  textDecoration: "underline",
                  cursor: "pointer",
                  fontSize: 13
                }}
              >
                Riattiva avviso suggerimenti prima della pubblicazione
              </button>
            </div>
          ) : null}
          {errorMessage ? (
            <p style={{ margin: "8px 0 0", color: "#b42318", fontSize: 13 }}>{errorMessage}</p>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className="btn"
            type="button"
            onClick={handleTogglePublish}
            disabled={isBusy}
          >
            {isPublished
              ? "Metti in bozza"
              : isChecklistLoading
              ? "Controllo suggerimenti..."
              : "Salva e pubblica"}
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => {
              setErrorMessage(null);
              setShowRestorePrompt(true);
            }}
            disabled={isBusy}
          >
            Ripristina ultima versione pubblicata
          </button>
        </div>
      </div>

      {showChecklistPrompt ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2, 6, 23, 0.45)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            zIndex: 70
          }}
          onClick={() => setShowChecklistPrompt(false)}
        >
          <div
            className="card"
            style={{ width: "min(680px, 100%)", maxHeight: "80vh", overflow: "auto" }}
            onClick={(event) => event.stopPropagation()}
          >
            <h3 style={{ margin: 0, color: "#0e4b58" }}>Pubblica comunque?</h3>
            <p className="text-muted" style={{ marginTop: 8 }}>
              Abbiamo trovato alcuni suggerimenti editoriali. Non sono obbligatori: puoi pubblicare ora oppure
              completare dopo.
            </p>
            <ul style={{ margin: "12px 0", paddingLeft: 18, display: "grid", gap: 8 }}>
              {checklistItems.map((item) => (
                <li key={item.id} style={{ color: "#334155" }}>
                  {item.message}
                </li>
              ))}
            </ul>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <input
                type="checkbox"
                checked={dismissChoice}
                onChange={(event) => setDismissChoice(event.target.checked)}
              />
              <span>Non mostrare piu questo avviso per questo homebook</span>
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setShowChecklistPrompt(false)}
                disabled={isPending}
              >
                Annulla
              </button>
              <button className="btn" type="button" onClick={confirmPublishAnyway} disabled={isPending}>
                Pubblica comunque
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showRestorePrompt ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2, 6, 23, 0.45)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            zIndex: 70
          }}
          onClick={() => setShowRestorePrompt(false)}
        >
          <div
            className="card"
            style={{ width: "min(520px, 100%)", maxHeight: "80vh", overflow: "auto" }}
            onClick={(event) => event.stopPropagation()}
          >
            <h3 style={{ margin: 0, color: "#0e4b58" }}>Conferma ripristino</h3>
            <p className="text-muted" style={{ marginTop: 8 }}>
              Sei sicuro di voler ripristinare l&apos;ultima versione pubblicata?
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setShowRestorePrompt(false)}
                disabled={isPending}
              >
                Annulla
              </button>
              <button
                className="btn"
                type="button"
                onClick={confirmRestoreLatestPublished}
                disabled={isPending}
              >
                Si, ripristina
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
