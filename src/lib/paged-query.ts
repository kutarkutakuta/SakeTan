export async function collectPaged<T>(
  readPage: (from: number, to: number) => Promise<T[]>,
  pageSize = 1000,
) {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const page = await readPage(from, from + pageSize - 1);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
