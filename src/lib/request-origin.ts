function asOrigin(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function trustedRequestOrigin(
  request: Request,
  configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL,
) {
  if (request.headers.get("sec-fetch-site") === "same-origin") return true;

  const suppliedOrigin = asOrigin(request.headers.get("origin"));
  if (!suppliedOrigin) return false;
  const allowed = new Set<string>([new URL(request.url).origin]);
  const configuredOrigin = asOrigin(configuredSiteUrl);
  if (configuredOrigin) allowed.add(configuredOrigin);

  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const host = forwardedHost || request.headers.get("host");
  const forwardedProtocol = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  if (host) {
    const protocol =
      forwardedProtocol || new URL(request.url).protocol.slice(0, -1);
    const proxyOrigin = asOrigin(`${protocol}://${host}`);
    if (proxyOrigin) allowed.add(proxyOrigin);
  }
  return allowed.has(suppliedOrigin);
}
