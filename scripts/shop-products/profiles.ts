import profiles from "../../config/shop-product-source-profiles.json";

export type SourceProfile = {
  name: string;
  host?: string;
  hostSuffix?: string;
  pathPrefix?: string;
  selector?: string;
  itemContainerSelector?: string;
  brandSelector?: string;
  brandSplitPattern?: string;
  brewerySelector?: string;
  breweryPattern?: string;
  canonicalizeBrandPrefix?: boolean;
  maxPages?: number;
  ignoreNamePatterns?: string[];
};

export function sourceProfileFor(sourceUrl: string) {
  const url = new URL(sourceUrl);
  return (
    (profiles as SourceProfile[]).find((profile) => {
      const hostMatches = profile.host
        ? url.hostname === profile.host
        : profile.hostSuffix
          ? url.hostname.endsWith(profile.hostSuffix)
          : false;
      return (
        hostMatches &&
        (!profile.pathPrefix || url.pathname.startsWith(profile.pathPrefix))
      );
    }) ?? null
  );
}

export function profileAllowsName(
  profile: SourceProfile | null,
  sourceName: string,
) {
  return !profile?.ignoreNamePatterns?.some((pattern) =>
    new RegExp(pattern, "iu").test(sourceName),
  );
}
