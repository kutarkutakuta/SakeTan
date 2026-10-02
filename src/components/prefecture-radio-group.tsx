import { prefectures } from "@/lib/brand-index";

function shortPrefecture(value: string) {
  return value === "北海道" ? value : value.replace(/[都府県]$/u, "");
}

export function PrefectureRadioGroup({
  name,
  value,
  onChange,
  required = false,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <fieldset className="prefecture-radio-field">
      <legend>
        都道府県{" "}
        {required ? (
          <span className="required">必須</span>
        ) : (
          <span className="muted">任意</span>
        )}
      </legend>
      <div className="prefecture-radio-tags">
        {prefectures.map((prefecture) => (
          <label key={prefecture}>
            <input
              type="radio"
              name={name}
              value={prefecture}
              checked={value === prefecture}
              onChange={() => onChange(prefecture)}
            />
            <span>{shortPrefecture(prefecture)}</span>
          </label>
        ))}
      </div>
      {!required && value && (
        <button
          type="button"
          className="inline-link prefecture-radio-clear"
          onClick={() => onChange("")}
        >
          未設定に戻す
        </button>
      )}
    </fieldset>
  );
}
