import { viewerIdentity } from "@/lib/supabase/browser";

export async function GET() {
  const { user, anonymous, name } = await viewerIdentity();
  return Response.json(
    {
      signedIn: Boolean(user && !anonymous),
      anonymous,
      name,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
