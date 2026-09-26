"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronRight, X } from "lucide-react";
import { errorMessage, fetchJson } from "@/lib/client";
import type { LatestShopComment, ShopCommentPage } from "@/lib/types";
import { dateLabel } from "@/lib/utils";
import { CommentText } from "@/components/comment-text";

type CommentPopoverPosition = {
  left: number;
  width: number;
  edge: number;
  arrowLeft: number;
  placement: "above" | "below";
};

export function useShopCommentPopover() {
  const [shopId, setShopId] = useState<string | null>(null);
  const [position, setPosition] = useState<CommentPopoverPosition | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setShopId(null);
    setPosition(null);
  }, []);

  const toggle = useCallback(
    (nextShopId: string, anchor: HTMLElement) => {
      if (shopId === nextShopId) {
        close();
        return;
      }
      setPosition(positionFromAnchor(anchor));
      setShopId(nextShopId);
    },
    [close, shopId],
  );

  useEffect(() => {
    if (!shopId) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      if (
        event.target instanceof Element &&
        event.target.closest("[data-comment-trigger]")
      )
        return;
      if (
        event.target instanceof Node &&
        !popoverRef.current?.contains(event.target)
      )
        close();
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [close, shopId]);

  return { close, popoverRef, position, shopId, toggle };
}

export function ShopCommentPopover({
  initialComment,
  initialTotal,
  onClose,
  onShopNavigate,
  popoverRef,
  position,
  shopHref,
  shopId,
  shopName,
}: {
  initialComment: LatestShopComment | null;
  initialTotal: number;
  onClose: () => void;
  onShopNavigate: () => void;
  popoverRef: RefObject<HTMLDivElement | null>;
  position: CommentPopoverPosition;
  shopHref: string;
  shopId: string;
  shopName: string;
}) {
  const [comment, setComment] = useState(initialComment);
  const [total, setTotal] = useState(initialTotal);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      requestRef.current?.abort();
    },
    [],
  );

  async function showComment(nextOffset: number) {
    requestRef.current?.abort();
    const abort = new AbortController();
    requestRef.current = abort;
    setLoading(true);
    setError("");
    try {
      const data = await fetchJson<ShopCommentPage>(
        `/api/shops/${shopId}/comments?offset=${nextOffset}`,
        { signal: abort.signal },
        "コメントを取得できませんでした",
      );
      if (data.latest) {
        setComment(data.latest);
        setOffset(data.offset);
      }
      setTotal(data.total);
    } catch (reason) {
      if (!abort.signal.aborted)
        setError(errorMessage(reason, "コメントを取得できませんでした"));
    } finally {
      if (!abort.signal.aborted) setLoading(false);
    }
  }

  return createPortal(
    <div
      ref={popoverRef}
      id="latest-shop-comment"
      className="shop-comment-preview"
      role="region"
      aria-live="polite"
      data-placement={position.placement}
      style={popoverStyle(position)}
      aria-label={`${shopName}のコメント`}
      aria-busy={loading}
    >
      <div className="shop-comment-preview-head">
        <div className="shop-comment-preview-meta">
          {comment ? (
            <>
              <span className="shop-comment-number">{offset + 1}.</span>
              <span>
                {comment.user_name ?? "ユーザー"}・
                {dateLabel(comment.commented_on)}
              </span>
            </>
          ) : (
            <span>まだコメントはありません。</span>
          )}
        </div>
        <button type="button" aria-label="コメントを閉じる" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      {comment && (
        <div className="shop-comment-preview-body" aria-live="polite">
          <p>
            <CommentText>{comment.comment}</CommentText>
          </p>
        </div>
      )}
      {error && (
        <p className="shop-comment-preview-error" role="alert">
          {error}
        </p>
      )}
      <nav className="shop-comment-preview-actions" aria-label="コメント操作">
        <div className="shop-comment-nav-buttons">
          <button
            type="button"
            aria-label="新しいコメントへ"
            title="新しいコメントへ"
            disabled={loading || !comment || offset === 0}
            onClick={() => void showComment(offset - 1)}
          >
            <span aria-hidden="true">←</span>
          </button>
          <button
            type="button"
            aria-label="古いコメントへ"
            title="古いコメントへ"
            disabled={loading || !comment || offset + 1 >= total}
            onClick={() => void showComment(offset + 1)}
          >
            <span aria-hidden="true">→</span>
          </button>
        </div>
        <Link href={shopHref} onNavigate={onShopNavigate}>
          コメントする
          <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
        </Link>
      </nav>
    </div>,
    document.body,
  );
}

function positionFromAnchor(anchor: HTMLElement): CommentPopoverPosition {
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(340, window.innerWidth - 24);
  const anchorCenter = rect.left + rect.width / 2;
  const left = Math.min(
    Math.max(12, anchorCenter - width / 2),
    window.innerWidth - width - 12,
  );
  const placement = rect.top > window.innerHeight * 0.55 ? "above" : "below";
  return {
    left,
    width,
    edge:
      placement === "above"
        ? window.innerHeight - rect.top + 9
        : rect.bottom + 9,
    arrowLeft: Math.min(Math.max(anchorCenter - left, 20), width - 20),
    placement,
  };
}

function popoverStyle(position: CommentPopoverPosition) {
  return {
    left: position.left,
    width: position.width,
    top: position.placement === "below" ? position.edge : undefined,
    bottom: position.placement === "above" ? position.edge : undefined,
    "--comment-arrow-left": `${position.arrowLeft}px`,
  } as CSSProperties;
}
