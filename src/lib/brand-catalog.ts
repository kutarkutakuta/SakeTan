import { loadDirectoryCatalog } from "./directory-catalog";

export async function loadBrandCatalog(signal: AbortSignal) {
  const brands = await loadDirectoryCatalog("brand", signal);
  // Posting also includes pending requests, but approved brands need a brewery.
  return brands.filter(
    (brand) =>
      brand.registration_status === "pending" || Boolean(brand.breweries?.id),
  );
}
