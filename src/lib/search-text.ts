export function normalizeKanaSearchText(value: string) {
  return value.replace(/づ/gu, "ず").replace(/ぢ/gu, "じ");
}
