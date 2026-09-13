import { z } from "zod";
import { todayJapan } from "./utils";
const optionalText = z.string().trim().max(150).nullable();
const website = z.union([
  z
    .url()
    .refine(
      (v) => /^https?:\/\//.test(v),
      "http または https のURLを入力してください",
    ),
  z.null(),
]);
export const masterSchemas = {
  brewery: z
    .object({
      name: z.string().trim().min(1).max(150),
      name_kana: optionalText,
      prefecture: optionalText,
      website_url: website,
      is_active: z.boolean().optional(),
    })
    .strict(),
  brand: z
    .object({
      name: z.string().trim().min(1).max(150),
      name_kana: optionalText,
      brewery_id: z.uuid().nullable(),
      is_active: z.boolean().optional(),
    })
    .strict(),
  shop: z
    .object({
      name: z.string().trim().min(1).max(150),
      name_kana: z.string().trim().min(1).max(150),
      prefecture: optionalText,
      city: optionalText,
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      google_place_id: optionalText,
      geocode_source: z.literal("google").optional(),
      geocode_precision: z
        .enum([
          "ROOFTOP",
          "RANGE_INTERPOLATED",
          "GEOMETRIC_CENTER",
          "APPROXIMATE",
          "PLACE",
          "USER_ADJUSTED",
        ])
        .optional(),
      website_url: website,
      is_active: z.boolean().optional(),
    })
    .refine(
      (value) =>
        Boolean(value.geocode_source) === Boolean(value.geocode_precision),
      "位置情報の取得元を確認してください",
    )
    .strict(),
};
export const observedDate = z.iso
  .date()
  .refine(
    (value) => value <= todayJapan(),
    "見つけた日は今日以前の日付を入力してください",
  );
export const actionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("post"),
    shop_id: z.uuid(),
    brand_id: z.uuid(),
    observed_at: observedDate,
    comment: z.null(),
  }),
  z.object({
    kind: z.literal("sighting"),
    id: z.uuid(),
    observed_at: observedDate,
    comment: z.string().trim().max(1000).nullable(),
    is_deleted: z.boolean(),
  }),
  z.object({
    kind: z.literal("shop_brand_status"),
    shop_id: z.uuid(),
    brand_id: z.uuid(),
    status: z.enum(["available", "unavailable", "incorrect"]),
    reason: z.string().trim().max(500).nullable(),
  }),
  z.object({
    kind: z.literal("brand_request"),
    name: z.string().trim().min(1).max(150),
    brewery_name: z.string().trim().max(150).nullable(),
    note: z.string().trim().max(500).nullable(),
    shop_id: z.uuid(),
  }),
  z.object({
    kind: z.literal("shop_comment"),
    shop_id: z.uuid(),
    comment: z.string().trim().min(1).max(1000),
  }),
  z.object({
    kind: z.literal("shop_comment_edit"),
    id: z.uuid(),
    comment: z.string().trim().min(1).max(1000),
    is_deleted: z.boolean(),
  }),
  z.object({
    kind: z.literal("master"),
    type: z.enum(["shop", "brand", "brewery"]),
    id: z.uuid().nullable(),
    data: z.record(z.string(), z.unknown()),
    reason: z.string().trim().max(500).nullable(),
  }),
  z.object({ kind: z.literal("restore"), id: z.uuid() }),
  z.object({
    kind: z.literal("profile"),
    name: z.string().trim().min(1).max(30),
  }),
  z.object({
    kind: z.literal("brand_request_review"),
    id: z.uuid(),
    status: z.enum(["resolved", "dismissed"]),
  }),
]);
