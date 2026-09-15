"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X } from "lucide-react";
import type { LatestShopComment } from "@/lib/types";
import { dateLabel } from "@/lib/utils";

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
  comment,
  onClose,
  popoverRef,
  position,
  shopId,
  shopName,
}: {
  comment: LatestShopComment;
  onClose: () => void;
  popoverRef: RefObject<HTMLDivElement | null>;
  position: CommentPopoverPosition;
  shopId: string;
  shopName: string;
}) {
  return createPortal(
    <div
      ref={popoverRef}
      id="latest-shop-comment"
      className="shop-comment-preview"
      role="region"
      aria-live="polite"
      data-placement={position.placement}
      style={popoverStyle(position)}
      aria-label={`${shopName}の最新コメント`}
    >
      <div className="shop-comment-preview-head">
        <div>
          <strong>{shopName}</strong>
          <span>
            {comment.user_name ?? "ユーザー"}・{dateLabel(comment.commented_on)}
          </span>
        </div>
        <button type="button" aria-label="コメントを閉じる" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <p>{comment.comment}</p>
      <Link href={`/shops/${shopId}#comments`}>店舗ページで見る</Link>
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
