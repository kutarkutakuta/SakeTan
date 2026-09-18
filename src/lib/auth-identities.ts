import { z } from "zod";

const identityProviders = ["google", "x", "twitter", "facebook"] as const;

export type IdentityProvider = (typeof identityProviders)[number];

export const identityProviderNames: Record<IdentityProvider, string> = {
  google: "Google",
  x: "X",
  twitter: "X",
  facebook: "Facebook",
};

export const unlinkIdentitySchema = z
  .object({
    identity_id: z.string().trim().min(1).max(200),
    provider: z.enum(identityProviders),
  })
  .strict();

export function isIdentityProvider(value: string): value is IdentityProvider {
  return identityProviders.includes(value as IdentityProvider);
}

export function loginProviderForIdentity(provider: IdentityProvider) {
  return provider === "twitter" ? "x" : provider;
}
