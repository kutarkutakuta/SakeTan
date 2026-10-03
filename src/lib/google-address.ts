type GoogleAddressComponent = {
  types: string[];
  longText?: string | null;
  long_name?: string | null;
};

export function addressComponent(
  items: GoogleAddressComponent[] | undefined,
  types: string[],
) {
  for (const type of types) {
    const item = items?.find((candidate) => candidate.types.includes(type));
    const value = item?.longText ?? item?.long_name;
    if (value) return value;
  }
  return null;
}

export function municipality(items: GoogleAddressComponent[] | undefined) {
  const locality = addressComponent(items, ["locality"]);
  const sublocality = addressComponent(items, ["sublocality_level_1"]);

  // 政令指定都市では「市」と「区」が別々のコンポーネントで返る。
  // 東京23区など locality 自体が区の場合、下位の町名は結合しない。
  if (
    locality?.endsWith("市") &&
    sublocality?.endsWith("区") &&
    !locality.endsWith(sublocality)
  ) {
    return `${locality}${sublocality}`;
  }

  return (
    locality ??
    addressComponent(items, ["administrative_area_level_2", "postal_town"]) ??
    (sublocality?.endsWith("区") ? sublocality : null)
  );
}
