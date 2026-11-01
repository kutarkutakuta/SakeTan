const formatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  timeZone: "Asia/Tokyo",
});

export function RecordDate({
  value,
  label = "更新日",
}: {
  value?: string;
  label?: "更新日" | "登録日";
}) {
  if (!value) return null;
  const date = formatter.format(new Date(value));
  const description = `${label}：${date}`;
  return (
    <time
      className="record-date"
      dateTime={value}
      title={description}
      aria-label={description}
    >
      {date}
    </time>
  );
}
