/**
 * OpenClaw integration configuration for workers.
 *
 * Reads and validates env vars at import time.
 * Fails fast on startup when the integration is enabled but required vars are missing.
 */

export interface OpenClawConfig {
  enabled: boolean;
  gatewayUrl: string;
  gatewayToken: string;
  controlApiUrl: string;
  defaultModel?: string;
  dispatchPollMs: number;
}

function loadConfig(): OpenClawConfig {
  const enabled = process.env.OPENCLAW_ENABLED === 'true';

  if (!enabled) {
    return {
      enabled: false,
      gatewayUrl: '',
      gatewayToken: '',
      controlApiUrl: '',
      dispatchPollMs: 10_000
    };
  }

  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;

  const missing: string[] = [];
  if (!gatewayUrl) missing.push('OPENCLAW_GATEWAY_URL');
  if (!gatewayToken) missing.push('OPENCLAW_GATEWAY_TOKEN');

  if (missing.length > 0) {
    console.error(
      `openclaw-config: OPENCLAW_ENABLED=true but required env vars are missing: ${missing.join(', ')}`
    );
    process.exit(1);
  }

  const controlApiUrl = process.env.CONTROL_API_URL || 'http://localhost:3000';
  const defaultModel = process.env.OPENCLAW_DEFAULT_MODEL || undefined;
  const dispatchPollMs = Number(process.env.OPENCLAW_DISPATCH_POLL_MS ?? 10_000);

  if (!Number.isFinite(dispatchPollMs) || dispatchPollMs < 1000) {
    console.error(
      `openclaw-config: OPENCLAW_DISPATCH_POLL_MS must be a number >= 1000, got: ${process.env.OPENCLAW_DISPATCH_POLL_MS}`
    );
    process.exit(1);
  }

  return {
    enabled: true,
    gatewayUrl: gatewayUrl!,
    gatewayToken: gatewayToken!,
    controlApiUrl,
    defaultModel,
    dispatchPollMs
  };
}

export const openclawConfig = loadConfig();
