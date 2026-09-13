import { LogIn } from "lucide-react";
import { LoginOptions } from "@/components/login-options";
export function LoginRequired({
  next,
  ready = true,
}: {
  next: string;
  ready?: boolean;
}) {
  return (
    <div className="card login-card">
      <LogIn size={30} />
      <h2>あなたの発見を、つなげよう。</h2>
      <p>
        {ready
          ? "投稿・登録・編集にはログインが必要です。"
          : "投稿・登録・編集は、Supabase接続設定後に利用できます。"}
      </p>
      {ready && <LoginOptions next={next} />}
    </div>
  );
}
