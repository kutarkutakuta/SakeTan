export type Prefecture = { id: number; name: string; slug: string };

const names = [
  ["北海道", "hokkaido"],
  ["青森県", "aomori"],
  ["岩手県", "iwate"],
  ["秋田県", "akita"],
  ["宮城県", "miyagi"],
  ["山形県", "yamagata"],
  ["福島県", "fukushima"],
  ["栃木県", "tochigi"],
  ["群馬県", "gunma"],
  ["茨城県", "ibaraki"],
  ["埼玉県", "saitama"],
  ["千葉県", "chiba"],
  ["東京都", "tokyo"],
  ["神奈川県", "kanagawa"],
  ["山梨県", "yamanashi"],
  ["新潟県", "niigata"],
  ["長野県", "nagano"],
  ["富山県", "toyama"],
  ["石川県", "ishikawa"],
  ["福井県", "fukui"],
  ["静岡県", "shizuoka"],
  ["岐阜県", "gifu"],
  ["愛知県", "aichi"],
  ["三重県", "mie"],
  ["滋賀県", "shiga"],
  ["京都府", "kyoto"],
  ["奈良県", "nara"],
  ["大阪府", "osaka"],
  ["兵庫県", "hyogo"],
  ["和歌山県", "wakayama"],
  ["岡山県", "okayama"],
  ["広島県", "hiroshima"],
  ["鳥取県", "tottori"],
  ["島根県", "shimane"],
  ["山口県", "yamaguchi"],
  ["香川県", "kagawa"],
  ["愛媛県", "ehime"],
  ["徳島県", "tokushima"],
  ["高知県", "kochi"],
  ["福岡県", "fukuoka"],
  ["佐賀県", "saga"],
  ["長崎県", "nagasaki"],
  ["大分県", "oita"],
  ["熊本県", "kumamoto"],
  ["宮崎県", "miyazaki"],
  ["鹿児島県", "kagoshima"],
  ["沖縄県", "okinawa"],
] as const;

export const prefectures: Prefecture[] = names.map(([name, slug], index) => ({
  id: index + 1,
  name,
  slug,
}));
export function prefectureUrl(id: number) {
  return `https://www.sakeno.com/sakaya_todou/${id}/`;
}
export function fileStem(prefecture: Prefecture) {
  return `${String(prefecture.id).padStart(2, "0")}-${prefecture.slug}`;
}
export function pagePrefectureName(prefecture: Prefecture) {
  return prefecture.name === "北海道"
    ? prefecture.name
    : prefecture.name.replace(/[都府県]$/, "");
}
