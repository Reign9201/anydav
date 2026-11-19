import { DavError } from './errors.js';
import { PROVIDER_SPEC } from './providers.generated.js';
import type { ProviderMatch, ProviderPreset, ProviderSpecFile } from './types.js';

export const PROVIDER_SPEC_FILE: ProviderSpecFile = PROVIDER_SPEC;
export const PROVIDERS: readonly ProviderPreset[] = PROVIDER_SPEC.providers;

const BY_ID = new Map<string, ProviderPreset>(PROVIDERS.map((provider) => [provider.id, provider]));

export function getProvider(id: string): ProviderPreset {
  const provider = BY_ID.get(id.trim().toLowerCase());
  if (!provider) {
    throw new DavError({
      code: 'PROVIDER_UNKNOWN',
      message: `Unknown WebDAV provider: ${id}`,
      hint: `可用 provider: ${PROVIDERS.map((p) => p.id).join(', ')}`,
    });
  }
  return provider;
}

export function hasProvider(id: string): boolean {
  return BY_ID.has(id.trim().toLowerCase());
}

function hostMatches(host: string, pattern: string): boolean {
  const p = pattern.toLowerCase();
  return host === p || host.endsWith(p.startsWith('.') ? p : '.' + p);
}

function scoreProvider(url: URL, provider: ProviderPreset): { score: number; reasons: string[] } {
  const detect = provider.detect;
  if (!detect) return { score: 0, reasons: [] };
  let score = 0;
  const reasons: string[] = [];
  const host = url.hostname.toLowerCase();
  const pathname = url.pathname;

  for (const candidate of detect.hosts ?? []) {
    if (host === candidate.toLowerCase()) {
      score += 100;
      reasons.push(`host=${candidate}`);
    }
  }
  for (const suffix of detect.hostSuffixes ?? []) {
    if (hostMatches(host, suffix)) {
      score += 80;
      reasons.push(`host~${suffix}`);
    }
  }
  for (const fragment of detect.pathIncludes ?? []) {
    if (pathname.toLowerCase().includes(fragment.toLowerCase())) {
      score += 60;
      reasons.push(`path~${fragment}`);
    }
  }
  const port = url.port
    ? Number(url.port)
    : url.protocol === 'https:'
      ? 443
      : url.protocol === 'http:'
        ? 80
        : undefined;
  for (const candidate of detect.ports ?? []) {
    if (port === candidate) {
      score += 30;
      reasons.push(`port=${candidate}`);
    }
  }
  return { score, reasons };
}

/** Detect the most likely provider from a WebDAV base URL. */
export function detectProvider(baseUrl: string): ProviderMatch {
  let url: URL;
  try {
    url = new URL(baseUrl.trim());
  } catch {
    throw new DavError({
      code: 'INVALID_URL',
      message: `Invalid WebDAV URL: ${baseUrl}`,
      hint: '地址必须以 http:// 或 https:// 开头。',
    });
  }
  let best: ProviderMatch | undefined;
  let bestScore = 0;
  for (const provider of PROVIDERS) {
    const { score, reasons } = scoreProvider(url, provider);
    if (score > bestScore) {
      bestScore = score;
      best = {
        provider,
        confidence: score >= 100 ? 'high' : score >= 60 ? 'medium' : 'low',
        reason: reasons.join(', '),
      };
    }
  }
  if (best) return best;
  return {
    provider: getProvider('generic'),
    confidence: 'none',
    reason: 'no provider pattern matched',
  };
}

export interface ResolvedProvider {
  provider: ProviderPreset;
  match: ProviderMatch;
  detected: boolean;
}

/** Resolve an explicit provider id/object, or detect one from the base URL. */
export function resolveProvider(
  provider: string | ProviderPreset | undefined,
  baseUrl: string,
): ResolvedProvider {
  if (provider && typeof provider === 'object') {
    return {
      provider,
      detected: false,
      match: { provider, confidence: 'high', reason: 'explicit provider object' },
    };
  }
  if (typeof provider === 'string' && provider.trim()) {
    const preset = getProvider(provider);
    return {
      provider: preset,
      detected: false,
      match: { provider: preset, confidence: 'high', reason: 'explicit provider id' },
    };
  }
  const match = detectProvider(baseUrl);
  return { provider: match.provider, match, detected: match.confidence !== 'none' };
}

export interface UrlTemplateVars {
  host?: string;
  username?: string;
  email?: string;
  server?: string;
  id?: string;
  port?: string | number;
  share?: string;
}

/**
 * Fill a provider URL template. Unknown placeholders are left untouched so a
 * settings UI can show the template until the user supplies every value.
 */
export function fillUrlTemplate(template: string, vars: UrlTemplateVars): string {
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (match, key: string) => {
    const value = vars[key as keyof UrlTemplateVars];
    return value === undefined || value === '' ? match : String(value);
  });
}

/** Convenience for settings UIs: provider id -> localized label. */
export function providerLabel(provider: ProviderPreset, locale?: string): string {
  if (locale && /^zh/i.test(locale)) return provider.nameZh || provider.name;
  return provider.name;
}

export { PROVIDER_SPEC };
