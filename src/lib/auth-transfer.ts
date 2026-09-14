export const anonymousTransferCookie = "saketan-anonymous-transfer";

export function anonymousTransferCookieOptions() {
  return {
    httpOnly: true,
    maxAge: 15 * 60,
    path: "/auth/callback",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}
