type PdfTextItem = {
  str?: string;
  transform?: number[];
};

function pageLines(items: PdfTextItem[]) {
  const positioned = items
    .filter((item): item is Required<Pick<PdfTextItem, "str" | "transform">> =>
      Boolean(item.str?.trim() && item.transform && item.transform.length >= 6),
    )
    .map((item) => ({
      text: item.str.trim(),
      x: item.transform[4],
      y: item.transform[5],
    }))
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: Array<{ y: number; parts: Array<{ x: number; text: string }> }> =
    [];
  for (const item of positioned) {
    const line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= 2);
    if (line) line.parts.push({ x: item.x, text: item.text });
    else lines.push({ y: item.y, parts: [{ x: item.x, text: item.text }] });
  }
  return lines
    .sort((a, b) => b.y - a.y)
    .map((line) =>
      line.parts
        .sort((a, b) => a.x - b.x)
        .map((part) => part.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .join("\n");
}

export async function extractPdfPages(bytes: Uint8Array) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = getDocument({
    data: bytes,
    useSystemFonts: true,
  });
  const document = await loadingTask.promise;
  const pages: Array<{ pageNumber: number; text: string }> = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push({
      pageNumber,
      text: pageLines(content.items as PdfTextItem[]),
    });
    page.cleanup();
  }
  await loadingTask.destroy();
  return pages;
}
