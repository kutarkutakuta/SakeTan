export function changeReasonError(value: string) {
  const compact = Array.from(value.trim()).filter(
    (character) => !/\s/u.test(character),
  );
  if (compact.length === 0) return "変更理由を入力してください";
  if (compact.length < 2 || compact.every((value) => value === compact[0]))
    return "変更理由は、同じ文字の繰り返しではなく具体的に入力してください";
  return null;
}
