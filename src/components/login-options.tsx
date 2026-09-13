const options = [
  ["google", "Google"],
  ["x", "X"],
  ["facebook", "Facebook"],
] as const;

export function LoginOptions({
  next = "/",
  exclude = [],
  linking = false,
}: {
  next?: string;
  exclude?: string[];
  linking?: boolean;
}) {
  return (
    <div className="login-options">
      {options
        .filter(([provider]) => !exclude.includes(provider))
        .map(([provider, name]) => (
          <a
            className={`button social-login ${provider}`}
            href={
              "/auth/login?" +
              new URLSearchParams({ provider, next }).toString()
            }
            key={provider}
          >
            {linking ? `${name}をログイン方法に追加` : `${name}で続ける`}
          </a>
        ))}
      {options.every(([provider]) => exclude.includes(provider)) && (
        <p className="hint">すべてのログイン方法を連携済みです。</p>
      )}
    </div>
  );
}
