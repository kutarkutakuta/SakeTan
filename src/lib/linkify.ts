export type LinkifiedTextPart = {
  kind: "text" | "link";
  value: string;
};

const trailingPunctuation = /[.,!?;:。、！？；：\]｝】」』〉》]+$/u;

function separateTrailingPunctuation(value: string) {
  let url = value;
  let suffix = "";
  const punctuation = url.match(trailingPunctuation)?.[0];
  if (punctuation) {
    url = url.slice(0, -punctuation.length);
    suffix = punctuation;
  }

  const openParentheses = [...url].filter(
    (character) => character === "(" || character === "（",
  ).length;
  let closeParentheses = [...url].filter(
    (character) => character === ")" || character === "）",
  ).length;
  while (
    closeParentheses > openParentheses &&
    (url.endsWith(")") || url.endsWith("）"))
  ) {
    suffix = url.at(-1) + suffix;
    url = url.slice(0, -1);
    closeParentheses -= 1;
  }

  return { suffix, url };
}

export function linkifyText(value: string): LinkifiedTextPart[] {
  const parts: LinkifiedTextPart[] = [];
  const urlPattern = /https?:\/\/[^\s<>"']+/giu;
  let cursor = 0;

  for (const match of value.matchAll(urlPattern)) {
    const start = match.index;
    if (start > cursor)
      parts.push({ kind: "text", value: value.slice(cursor, start) });

    const matchedValue = match[0];
    const { suffix, url } = separateTrailingPunctuation(matchedValue);
    parts.push({ kind: "link", value: url });
    if (suffix) parts.push({ kind: "text", value: suffix });
    cursor = start + matchedValue.length;
  }

  if (cursor < value.length)
    parts.push({ kind: "text", value: value.slice(cursor) });
  return parts.length ? parts : [{ kind: "text", value }];
}
