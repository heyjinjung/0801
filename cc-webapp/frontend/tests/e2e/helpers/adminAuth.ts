export function getAdminBearerFromEnv(): string | null {
  const candidates = [
    process.env.E2E_ADMIN_BEARER,
    process.env.ADMIN_BEARER,
    process.env.ADMIN_TOKEN,
  ].filter(Boolean) as string[];
  return candidates.length > 0 ? candidates[0] : null;
}

export function getAdminHeaders(): Record<string, string> | null {
  const tok = getAdminBearerFromEnv();
  if (!tok) return null;
  return { Authorization: `Bearer ${tok}` };
}
