import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

let initialized = false;

function configure() {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("Google Maps APIキーが設定されていません");
  if (!initialized) {
    setOptions({ key, v: "weekly", language: "ja", region: "JP" });
    initialized = true;
  }
}

export async function loadGoogleMaps() {
  configure();
  const [maps, marker] = await Promise.all([
    importLibrary("maps"),
    importLibrary("marker"),
  ]);
  return { maps, marker };
}

export async function loadGooglePlaces() {
  configure();
  return importLibrary("places");
}

export function googleMapId() {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";
}
