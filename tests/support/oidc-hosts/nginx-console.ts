/**
 * SPEC0259 §4.9 — renderer of the console NGINX template (test support only;
 * the B1 slice does not package it). The only placeholder is the API origin,
 * which must be an exact `https:` origin: anything else (path, credentials,
 * a second source, a quote or `;` that would inject a CSP directive) throws.
 */
export const CONSOLE_NGINX_TEMPLATE_PATH =
  'deploy/console/nginx.console.conf.template'
export const API_ORIGIN_PLACEHOLDER = '__CVG_API_ORIGIN__'

export function isExactHttpsOrigin(value: string): boolean {
  if (typeof value !== 'string' || /[\s;'"]/.test(value)) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.origin === value
  } catch {
    return false
  }
}

export function renderConsoleNginxConf(
  template: string,
  apiOrigin: string
): string {
  if (!isExactHttpsOrigin(apiOrigin)) {
    throw new Error('The console API origin must be an exact https: origin')
  }
  if (!template.includes(API_ORIGIN_PLACEHOLDER)) {
    throw new Error('The console NGINX template has no API origin placeholder')
  }
  const rendered = template.replaceAll(API_ORIGIN_PLACEHOLDER, apiOrigin)
  if (/__CVG_[A-Z0-9_]+__/.test(rendered)) {
    throw new Error('The rendered console NGINX template keeps a placeholder')
  }
  return rendered
}
