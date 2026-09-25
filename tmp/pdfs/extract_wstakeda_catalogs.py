import json
import pathlib
import re
import sys

import pdfplumber


SITE_URL = "https://www.wstakeda.com/products.html"
PAGE_BREWERIES = {
    2: ["男山", "西田酒造店", "鳩正宗", "八戸酒造", "秋田清酒", "福禄寿酒造", "新政酒造", "山本酒造店", "稲とアガベ醸造所"],
    3: ["南部美人", "亀の井酒造", "出羽桜酒造", "楯の川酒造", "山和酒造店", "平孝酒造", "宮泉銘醸", "花泉酒造"],
    4: ["小林酒造", "せんきん", "来福酒造", "神亀酒造", "土田酒造", "土井酒造場", "小布施ワイナリー", "宮尾酒造"],
    5: ["石本酒造", "樋木酒造", "加茂錦酒造", "諸橋酒造", "朝日酒造"],
    6: ["久須美酒造", "八海山", "丸山酒造場", "千代の光酒造", "北雪酒造", "枡田酒造店", "立山酒造", "菊姫", "吉田酒造店"],
    7: ["車多酒造", "黒龍酒造", "三千盛", "萬乗醸造"],
    8: ["名手酒造", "平和酒造", "冨田酒造", "浪乃音酒造", "松本酒造", "今西酒造", "王祿酒造"],
    9: ["天寶一", "柄酒造", "岩崎酒造", "永山本家酒造場", "大嶺酒造", "獺祭"],
    10: ["長州酒造", "南酒造場", "酔鯨酒造", "山口酒造場", "山の壽酒造", "みいの寿", "中野酒造", "光栄菊酒造"],
    11: ["辻本店", "白菊酒造", "丸本酒造", "嘉美心酒造", "利守酒造", "田中酒造場"],
    12: ["十八盛酒造", "三冠酒造", "落酒造場"],
}


def clean(value):
    return re.sub(r"\s+", " ", value or "").strip()


def compact(value):
    return re.sub(r"[\s／/・]", "", value or "")


def extract(path):
    items = []
    orphans = []
    seen_sections = {}
    current_brewery = None
    with pdfplumber.open(path) as document:
        for page_number, page in enumerate(document.pages, 1):
            if page_number not in PAGE_BREWERIES:
                continue
            expected = PAGE_BREWERIES[page_number]
            page_sections = []
            for table in page.extract_tables():
                for row in table:
                    cells = [clean(cell) for cell in row]
                    first = cells[0] if cells else ""
                    joined = " ".join(cell for cell in cells if cell)
                    if not re.fullmatch(r"\d{4,6}", first):
                        joined_key = compact(joined)
                        matches = [name for name in expected if compact(name) in joined_key]
                        if matches:
                            current_brewery = min(matches, key=lambda name: joined_key.index(compact(name)))
                            if not page_sections or page_sections[-1] != current_brewery:
                                page_sections.append(current_brewery)
                        continue
                    source_name = cells[1] if len(cells) > 1 else ""
                    if not source_name:
                        continue
                    if current_brewery is None:
                        orphans.append({"page": page_number, "code": first, "sourceName": source_name})
                        continue
                    items.append(
                        {
                            "sourceName": source_name,
                            "sourceBreweryName": current_brewery,
                            "sourceUrl": SITE_URL,
                            "pageUrl": SITE_URL,
                            "pageNumber": page_number,
                            "evidence": f"{path.name} p.{page_number}: {source_name} / {current_brewery}",
                            "method": "ai",
                        }
                    )
            seen_sections[page_number] = page_sections
    return items, orphans, seen_sections


def dedupe(items):
    result = []
    seen = set()
    for item in items:
        key = (compact(item["sourceName"]), compact(item["sourceBreweryName"]))
        if key in seen:
            continue
        seen.add(key)
        result.append(item)
    return result


june_path = pathlib.Path(sys.argv[1])
april_path = pathlib.Path(sys.argv[2])
output_path = pathlib.Path(sys.argv[3])
june_items, june_orphans, june_sections = extract(june_path)
april_items, april_orphans, april_sections = extract(april_path)
june = dedupe(june_items)
april = dedupe(april_items)
june_keys = {(compact(x["sourceName"]), compact(x["sourceBreweryName"])) for x in june}
april_keys = {(compact(x["sourceName"]), compact(x["sourceBreweryName"])) for x in april}

merged = list(june)
for item in april:
    key = (compact(item["sourceName"]), compact(item["sourceBreweryName"]))
    if key not in june_keys:
        merged.append(item)

payload = {
    "version": 1,
    "sourceUrl": SITE_URL,
    "generatedAt": "2026-09-25T15:00:00Z",
    "items": merged,
}
output_path.parent.mkdir(parents=True, exist_ok=True)
output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

print(json.dumps({
    "june_rows": len(june_items),
    "june_unique": len(june),
    "april_rows": len(april_items),
    "april_unique": len(april),
    "merged_unique": len(merged),
    "only_june": len(june_keys - april_keys),
    "only_april": len(april_keys - june_keys),
    "june_orphans": june_orphans,
    "april_orphans": april_orphans,
    "june_missing_sections": {str(page): [name for name in PAGE_BREWERIES[page] if name not in june_sections[page]] for page in PAGE_BREWERIES if any(name not in june_sections[page] for name in PAGE_BREWERIES[page])},
    "april_missing_sections": {str(page): [name for name in PAGE_BREWERIES[page] if name not in april_sections[page]] for page in PAGE_BREWERIES if any(name not in april_sections[page] for name in PAGE_BREWERIES[page])},
}, ensure_ascii=False))
