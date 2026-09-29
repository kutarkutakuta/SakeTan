// The public catalog is read directly from Supabase in the browser. Keep this
// endpoint inexpensive for clients that still have the old JavaScript cached.
export function GET() {
  return Response.json(
    {
      error:
        "銘柄一覧の取得方法が変わりました。ページを再読み込みしてください。",
    },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
