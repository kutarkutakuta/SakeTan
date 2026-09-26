"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2Off } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { errorMessage, fetchJson } from "@/lib/client";
import {
  identityProviderNames,
  type IdentityProvider,
} from "@/lib/auth-identities";

export type LinkedIdentity = {
  identityId: string;
  provider: IdentityProvider;
};

export function IdentityManager({
  identities,
  totalIdentityCount,
}: {
  identities: LinkedIdentity[];
  totalIdentityCount: number;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [busyIdentityId, setBusyIdentityId] = useState<string | null>(null);
  const [removedIdentityIds, setRemovedIdentityIds] = useState<Set<string>>(
    () => new Set(),
  );
  const visibleIdentities = useMemo(
    () =>
      identities.filter(
        (identity) => !removedIdentityIds.has(identity.identityId),
      ),
    [identities, removedIdentityIds],
  );
  const optimisticallyRemovedIdentityCount = identities.filter((identity) =>
    removedIdentityIds.has(identity.identityId),
  ).length;
  const remainingIdentityCount =
    totalIdentityCount - optimisticallyRemovedIdentityCount;
  const canUnlink = remainingIdentityCount > 1;

  async function unlink(identity: LinkedIdentity) {
    const providerName = identityProviderNames[identity.provider];
    if (
      !window.confirm(
        `${providerName}との連携を解除しますか？ 解除後は${providerName}でログインできなくなります。`,
      )
    )
      return;

    setBusyIdentityId(identity.identityId);
    try {
      await fetchJson<unknown>(
        "/auth/unlink",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            identity_id: identity.identityId,
            provider: identity.provider,
          }),
        },
        "ログイン方法の連携を解除できませんでした",
      );

      setRemovedIdentityIds((current) => {
        const next = new Set(current);
        next.add(identity.identityId);
        return next;
      });
      showToast(`${providerName}との連携を解除しました`);
      router.refresh();
    } catch (reason) {
      showToast(
        errorMessage(reason, "ログイン方法の連携を解除できませんでした"),
        "error",
      );
    } finally {
      setBusyIdentityId(null);
    }
  }

  if (!visibleIdentities.length) return null;

  return (
    <div className="identity-manager">
      <div className="identity-list" aria-label="連携済みのログイン方法">
        {visibleIdentities.map((identity) => {
          const providerName = identityProviderNames[identity.provider];
          const busy = busyIdentityId === identity.identityId;
          return (
            <div className="identity-row" key={identity.identityId}>
              <div className="identity-service">
                <strong>{providerName}</strong>
                <span>連携済み</span>
              </div>
              <button
                type="button"
                className="button ghost small identity-unlink"
                disabled={!canUnlink || busyIdentityId !== null}
                onClick={() => void unlink(identity)}
                aria-label={`${providerName}との連携を解除`}
              >
                <Link2Off size={16} aria-hidden="true" />
                {busy ? "解除しています…" : "連携を解除"}
              </button>
            </div>
          );
        })}
      </div>
      <p className="hint identity-help">
        {canUnlink
          ? "解除したサービスではログインできなくなります。"
          : "ログインできなくなるため、最後の1件は解除できません。先に別のログイン方法を追加してください。"}
      </p>
    </div>
  );
}
