import "server-only";

type OpsAlertSeverity = "info" | "warning" | "error" | "critical";

type OpsAlertInput = {
  source: string;
  title: string;
  message: string;
  severity?: OpsAlertSeverity;
  details?: Record<string, unknown>;
};

function asNonEmpty(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  return normalized.length ? normalized : null;
}

function parseTimeoutMs() {
  const raw = asNonEmpty(process.env.ALERT_WEBHOOK_TIMEOUT_MS);
  if (!raw) return 3500;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 3500;
  return Math.min(parsed, 15000);
}

export function isOpsAlertingEnabled() {
  return Boolean(asNonEmpty(process.env.ALERT_WEBHOOK_URL));
}

export async function sendOpsAlert({
  source,
  title,
  message,
  severity = "error",
  details = {}
}: OpsAlertInput) {
  const webhookUrl = asNonEmpty(process.env.ALERT_WEBHOOK_URL);
  if (!webhookUrl) {
    return false;
  }

  const payload = {
    app: "guesthomebook",
    environment: asNonEmpty(process.env.VERCEL_ENV) ?? asNonEmpty(process.env.NODE_ENV) ?? "unknown",
    source,
    severity,
    title,
    message,
    occurred_at: new Date().toISOString(),
    details
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), parseTimeoutMs());

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error("ops_alert_webhook_failed", {
        status: response.status,
        body: body.slice(0, 500)
      });
      return false;
    }

    return true;
  } catch (error: any) {
    console.error("ops_alert_dispatch_failed", {
      error: error?.message ?? "unknown_error"
    });
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
