"use client";
import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { errorMessage, fetchJson, mutate } from "@/lib/client";
import { changeReasonError } from "@/lib/change-reason";
import { mapReturnPath } from "@/lib/map-view";
import { masterDetailHref, masterDetailPath } from "@/lib/master-navigation";
import type { Brewery, EntityType } from "@/lib/types";
import { LocationPicker } from "@/components/location-picker";
import { PrefectureRadioGroup } from "@/components/prefecture-radio-group";
import { BreweryCreateFields } from "@/components/brewery-create-fields";
import { useToast } from "@/components/toast-provider";
const entityLabels = { shop: "酒屋", brand: "銘柄", brewery: "酒蔵" };
export function MasterForm({
  type,
  id,
  initial,
  initialBrewery,
  shopId,
  afterSaveHref,
  breweryReturnTo,
  kanaOnly = false,
  canDeactivate = true,
  admin,
}: {
  type: EntityType;
  id: string | null;
  initial: Record<string, unknown>;
  initialBrewery: Brewery | null;
  shopId?: string;
  afterSaveHref?: string;
  breweryReturnTo?: string;
  kanaOnly?: boolean;
  canDeactivate?: boolean;
  admin: boolean;
}) {
  const { showToast } = useToast();
  const approving =
    type === "brand" &&
    Boolean(id) &&
    admin &&
    initial.registration_status === "pending" &&
    initial.is_active !== false;
  const submitLabel = approving
    ? "保存して承認"
    : id
      ? "変更を保存"
      : `${entityLabels[type]}を登録`;
  const [searchError, setSearchError] = useState("");
  const [busy, setBusy] = useState(false);
  const [brewery, setBrewery] = useState(initialBrewery);
  const [query, setQuery] = useState(
    type === "brand" && !initialBrewery
      ? String(initial.requested_brewery_name ?? "")
      : "",
  );
  const [results, setResults] = useState<Brewery[]>([]);
  const [brewerySearching, setBrewerySearching] = useState(false);
  const [searchedBreweryQuery, setSearchedBreweryQuery] = useState<
    string | null
  >(null);
  const [creatingBrewery, setCreatingBrewery] = useState(false);
  const [createdBreweryId, setCreatedBreweryId] = useState<string | null>(null);
  const [shopName, setShopName] = useState(String(initial.name ?? ""));
  const [shopPrefecture, setShopPrefecture] = useState(
    String(initial.prefecture ?? ""),
  );
  const [breweryPrefecture, setBreweryPrefecture] = useState(
    String(initial.prefecture ?? ""),
  );
  const [shopCity, setShopCity] = useState(String(initial.city ?? ""));
  const [duplicateState, setDuplicateState] = useState({
    blocking: false,
    pending: false,
  });
  const [areaState, setAreaState] = useState({
    error: false,
    pending: false,
  });
  useEffect(() => {
    if (type !== "brand" || brewery || creatingBrewery || !query.trim()) {
      setResults([]);
      setSearchError("");
      setBrewerySearching(false);
      setSearchedBreweryQuery(null);
      return;
    }
    const abort = new AbortController();
    setSearchError("");
    setResults([]);
    setBrewerySearching(true);
    setSearchedBreweryQuery(null);
    const timer = setTimeout(async () => {
      try {
        const data = await fetchJson<Brewery[]>(
          "/api/breweries?q=" + encodeURIComponent(query),
          { signal: abort.signal },
          "検索できませんでした",
        );
        setResults(data);
        setSearchedBreweryQuery(query.trim());
      } catch (e) {
        if (!abort.signal.aborted)
          setSearchError(errorMessage(e, "検索できませんでした"));
      } finally {
        if (!abort.signal.aborted) setBrewerySearching(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query, type, brewery, creatingBrewery]);
  const value = (key: string) => String(initial[key] ?? "");
  const destinationAfterSave = (resultId: string) => {
    if (type === "shop") {
      if (!id) return mapReturnPath({ shopId: resultId });
      return afterSaveHref ?? "/shops/" + resultId;
    }
    if (type === "brand" && shopId)
      return "/post?shop_id=" + shopId + "&brand_id=" + resultId;
    if (approving) return afterSaveHref ?? "/brands";
    return afterSaveHref ?? "/edit?type=" + type;
  };
  async function saveKana(form: HTMLFormElement) {
    if (!id || type === "shop") return;
    setBusy(true);
    const f = new FormData(form);
    const text = (key: string) => String(f.get(key) ?? "").trim();
    try {
      const reasonError = !admin && changeReasonError(text("reason"));
      if (reasonError) throw new Error(reasonError);
      const result = await mutate({
        kind: "master_kana",
        type,
        id,
        name_kana: text("name_kana") || null,
        reason: text("reason") || null,
      });
      showToast(`${entityLabels[type]}のかなを保存しました`);
      window.location.assign(destinationAfterSave(result.id));
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : "保存できませんでした",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save(form: HTMLFormElement) {
    setBusy(true);
    const f = new FormData(form);
    const text = (key: string) => String(f.get(key) ?? "").trim();
    const nullable = (key: string) => text(key) || null;
    try {
      if (creatingBrewery)
        throw new Error("酒蔵の登録を完了するか、キャンセルしてください");
      if (type === "shop" && !id && duplicateState.pending)
        throw new Error("登録済み店舗の確認が終わるまでお待ちください");
      if (type === "shop" && !id && duplicateState.blocking)
        throw new Error("この店舗はすでに登録されています");
      if (type === "shop" && areaState.pending)
        throw new Error("地域情報の確認が終わるまでお待ちください");
      if (type === "shop" && areaState.error)
        throw new Error("地図位置を選び直して地域情報を確認してください");
      let selectedBrewery = brewery?.id ?? null;
      if (approving && !selectedBrewery)
        throw new Error("承認する銘柄の酒蔵を選択してください");
      const reasonError = id && !admin && changeReasonError(text("reason"));
      if (reasonError) throw new Error(reasonError);
      const data: Record<string, unknown> = {
        name: text("name"),
        name_kana: type === "shop" ? text("name_kana") : nullable("name_kana"),
      };
      if (id && (type !== "shop" || canDeactivate))
        data.is_active = approving || f.get("is_active") === "on";
      if (type === "brand") data.brewery_id = selectedBrewery;
      else {
        data.prefecture =
          type === "brewery"
            ? breweryPrefecture || null
            : nullable("prefecture");
        if (type === "brewery") data.website_url = nullable("website_url");
      }
      if (type === "shop") {
        if (admin)
          data.seeking_brand_info = f.get("seeking_brand_info") === "on";
        const latitude = text("latitude");
        const longitude = text("longitude");
        if (!latitude || !longitude)
          throw new Error("地図で店舗位置を設定してください");
        Object.assign(data, {
          city: nullable("city"),
          latitude: Number(latitude),
          longitude: Number(longitude),
          google_place_id: nullable("google_place_id"),
        });
        const geocodeSource = text("geocode_source");
        const geocodePrecision = text("geocode_precision");
        if (geocodeSource && geocodePrecision) {
          data.geocode_source = geocodeSource;
          data.geocode_precision = geocodePrecision;
        }
      }
      const result = await mutate(
        approving
          ? {
              kind: "brand_application_approve",
              brand_id: id,
              data,
              reason: nullable("reason"),
            }
          : {
              kind: "master",
              type,
              id,
              data,
              reason: nullable("reason"),
            },
      );
      showToast(
        approving
          ? "銘柄の編集内容を保存し、申請を承認しました"
          : id
            ? `${entityLabels[type]}の変更を保存しました`
            : `${entityLabels[type]}を登録しました`,
      );
      window.location.assign(destinationAfterSave(result.id));
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : "保存できませんでした",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }
  if (kanaOnly && id && type !== "shop")
    return (
      <form
        className="card form-stack kana-only-form"
        onSubmit={(event) => {
          event.preventDefault();
          void saveKana(event.currentTarget);
        }}
      >
        <div className="master-readonly-summary">
          <span>{entityLabels[type]}名</span>
          <strong>{value("name")}</strong>
          {type === "brand" && initialBrewery && (
            <small>
              {initialBrewery.name}
              {initialBrewery.prefecture
                ? `・${initialBrewery.prefecture}`
                : ""}
            </small>
          )}
          {type === "brewery" && value("prefecture") && (
            <small>{value("prefecture")}</small>
          )}
        </div>
        <label className="master-kana-field">
          かな <span className="muted">任意</span>
          <input
            name="name_kana"
            defaultValue={value("name_kana")}
            maxLength={150}
            autoFocus
          />
          <small>
            現在の読みを確認し、誤りや未登録の場合だけ修正してください。空欄で保存すると未登録に戻ります。
          </small>
        </label>
        <label>
          変更理由 <span className="required">必須</span>
          <textarea
            name="reason"
            minLength={2}
            maxLength={500}
            required
            placeholder="例：公式サイトの表記に合わせて修正"
          />
          <small>2文字以上で、変更内容が分かる理由を入力してください。</small>
        </label>
        <button disabled={busy} type="submit" className="button full">
          {busy ? "保存しています…" : "かなを保存"}
        </button>
      </form>
    );
  return (
    <form
      className="card form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        void save(e.currentTarget);
      }}
    >
      {type === "shop" && (
        <LocationPicker
          initialPosition={
            typeof initial.latitude === "number" &&
            typeof initial.longitude === "number"
              ? {
                  latitude: initial.latitude,
                  longitude: initial.longitude,
                }
              : null
          }
          initialGooglePlaceId={
            typeof initial.google_place_id === "string"
              ? initial.google_place_id
              : null
          }
          prefecture={shopPrefecture}
          city={shopCity}
          duplicateCheckEnabled={!id}
          onDuplicateStateChange={setDuplicateState}
          onAreaStateChange={setAreaState}
          onPlaceDetails={(details) => {
            if (details.name) setShopName(details.name);
            if (details.prefecture) {
              if (!details.city && details.prefecture !== shopPrefecture)
                setShopCity("");
              setShopPrefecture(details.prefecture);
            }
            if (details.city) setShopCity(details.city);
          }}
        />
      )}
      <label>
        {entityLabels[type]}名<span className="required">必須</span>
        <input
          name="name"
          defaultValue={type === "shop" ? undefined : value("name")}
          value={type === "shop" ? shopName : undefined}
          onChange={
            type === "shop"
              ? (event) => setShopName(event.target.value)
              : undefined
          }
          autoFocus={!id && type !== "shop"}
          required
          maxLength={150}
        />
      </label>
      <label className={type === "shop" ? undefined : "master-kana-field"}>
        かな{" "}
        {type === "shop" ? (
          <span className="required">必須</span>
        ) : (
          <span className="muted">任意</span>
        )}
        <input
          name="name_kana"
          defaultValue={value("name_kana")}
          required={type === "shop"}
          maxLength={150}
        />
        {type !== "shop" && (
          <small>現在の読みを確認し、必要な場合だけ修正してください。</small>
        )}
      </label>
      {type === "brand" ? (
        <div>
          <label>酒蔵</label>
          {brewery && (
            <div className="fixed-shop">
              <span>
                {brewery.name} <small>{brewery.prefecture}</small>
              </span>
              <button
                type="button"
                className="inline-link"
                onClick={() => setBrewery(null)}
              >
                選び直す
              </button>
              {id && (
                <a
                  className="inline-link"
                  href={
                    breweryReturnTo
                      ? masterDetailHref("brewery", brewery.id, breweryReturnTo)
                      : masterDetailPath("brewery", brewery.id)
                  }
                >
                  酒蔵を編集
                </a>
              )}
            </div>
          )}
          {!brewery && !creatingBrewery && (
            <>
              <label className="searchbox" style={{ marginTop: 8 }}>
                <Search size={18} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="酒蔵名・かなを検索"
                  aria-label="酒蔵名・かなを検索"
                  maxLength={150}
                />
              </label>
              {results.map((b) => (
                <button
                  type="button"
                  className="search-result"
                  key={b.id}
                  onClick={() => {
                    setBrewery(b);
                    setQuery("");
                    setCreatedBreweryId(null);
                  }}
                >
                  <span>
                    {b.name}
                    <small>{b.prefecture ?? "地域未登録"}</small>
                  </span>
                </button>
              ))}
              {brewerySearching && (
                <p className="hint" role="status">
                  酒蔵を検索しています…
                </p>
              )}
              {searchedBreweryQuery === query.trim() &&
                !brewerySearching &&
                !searchError &&
                results.length === 0 && (
                  <p className="hint">該当する酒蔵が見つかりませんでした。</p>
                )}
              {admin && !brewerySearching && !searchError && (
                <div className="brewery-create-entry">
                  <button
                    type="button"
                    className="button small"
                    onClick={() => setCreatingBrewery(true)}
                  >
                    <Plus size={17} aria-hidden="true" />
                    酒蔵を新規登録
                  </button>
                  <p className="hint">
                    該当する酒蔵がない場合は、このページで登録できます。
                  </p>
                </div>
              )}
              <p className="hint">
                {approving
                  ? "承認には酒蔵の選択が必要です。見つからない場合は新規登録してください。"
                  : "酒蔵が分からない場合は、未選択で登録できます。"}
              </p>
            </>
          )}
          {admin && !brewery && creatingBrewery && (
            <BreweryCreateFields
              initialName={query.trim() || value("requested_brewery_name")}
              onCreated={(created) => {
                setBrewery(created);
                setCreatedBreweryId(created.id);
                setCreatingBrewery(false);
                setQuery("");
                showToast(
                  approving
                    ? "酒蔵を登録しました。申請内容を確認して承認してください"
                    : "酒蔵を登録しました。銘柄の変更を保存してください",
                );
              }}
              onCancel={() => setCreatingBrewery(false)}
            />
          )}
          {brewery && brewery.id === createdBreweryId && (
            <p className="hint">
              この酒蔵との紐付けは「{submitLabel}
              」で確定します。
            </p>
          )}
        </div>
      ) : (
        <>
          {type === "brewery" ? (
            <PrefectureRadioGroup
              name="prefecture"
              value={breweryPrefecture}
              onChange={setBreweryPrefecture}
            />
          ) : (
            <input type="hidden" name="prefecture" value={shopPrefecture} />
          )}
          {type === "shop" && (
            <input type="hidden" name="city" value={shopCity} />
          )}
          {type === "brewery" && (
            <label>
              公式サイト <span className="muted">任意</span>
              <input
                name="website_url"
                type="url"
                defaultValue={value("website_url")}
                placeholder="https://"
              />
            </label>
          )}
        </>
      )}
      {type === "shop" && admin && (
        <div>
          <label className="check-label">
            <input
              type="checkbox"
              name="seeking_brand_info"
              defaultChecked={initial.seeking_brand_info === true}
            />
            銘柄情報求む
          </label>
          <p className="hint">
            取扱銘柄の情報が不足している店舗に表示します。情報が充実したらチェックを外してください。
          </p>
        </div>
      )}
      {id && (
        <>
          {!approving &&
            (type !== "shop" || canDeactivate ? (
              <>
                <label className="check-label">
                  <input
                    type="checkbox"
                    name="is_active"
                    defaultChecked={initial.is_active !== false}
                  />
                  {entityLabels[type]}を有効にする
                </label>
                <p className="hint">
                  チェックを外すと検索・取扱情報に表示されなくなります。履歴は残ります。
                </p>
              </>
            ) : (
              <p className="hint">
                店舗の無効化は登録者本人または管理者だけ実行できます。
              </p>
            ))}
          <label>
            変更理由{" "}
            <span className={admin ? "muted" : "required"}>
              {admin ? "任意" : "必須"}
            </span>
            <textarea
              name="reason"
              minLength={admin ? undefined : 2}
              maxLength={500}
              required={!admin}
              placeholder="例：お店の移転に伴い地図位置を変更"
            />
            {!admin && (
              <small>
                2文字以上で、変更内容が分かる理由を入力してください。
              </small>
            )}
          </label>
        </>
      )}
      {searchError && (
        <p className="notice error" role="alert">
          {searchError}
        </p>
      )}
      <button
        disabled={
          busy ||
          creatingBrewery ||
          (approving && !brewery) ||
          (type === "shop" && (areaState.pending || areaState.error)) ||
          (type === "shop" &&
            !id &&
            (duplicateState.pending || duplicateState.blocking))
        }
        type="submit"
        className="button full"
      >
        {busy
          ? approving
            ? "承認しています…"
            : "保存しています…"
          : type === "shop" && areaState.pending
            ? "地域情報を確認中…"
            : type === "shop" && areaState.error
              ? "地図位置を選び直してください"
              : type === "shop" && !id && duplicateState.pending
                ? "登録済み店舗を確認中…"
                : type === "shop" && !id && duplicateState.blocking
                  ? "登録済みの店舗です"
                  : submitLabel}
      </button>
    </form>
  );
}
