"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { CircleAlert, X } from "lucide-react";

type NoticePosition = {
  left: number;
  top: number;
  width: number;
};

export function ListingNotice() {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<NoticePosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setPosition(null);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  function toggle() {
    if (open) {
      close();
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(360, window.innerWidth - 24);
    setPosition({
      left: Math.min(
        Math.max(12, rect.right - width),
        window.innerWidth - width - 12,
      ),
      top: rect.bottom + 8,
      width,
    });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    function closeOnOutsidePointer(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !dialogRef.current?.contains(event.target) &&
        !triggerRef.current?.contains(event.target)
      )
        close();
    }
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [close, open]);

  return (
    <div className="listing-notice">
      <button
        ref={triggerRef}
        type="button"
        className="listing-notice-trigger"
        aria-label="掲載情報について"
        aria-controls="listing-notice-dialog"
        aria-expanded={open}
        onClick={toggle}
      >
        <CircleAlert size={19} aria-hidden="true" />
      </button>
      {open &&
        position &&
        createPortal(
          <>
            <div className="listing-notice-backdrop" aria-hidden="true" />
            <section
              ref={dialogRef}
              id="listing-notice-dialog"
              className="listing-notice-dialog"
              role="dialog"
              aria-labelledby="listing-notice-title"
              style={position as CSSProperties}
            >
              <div className="listing-notice-head">
                <div>
                  <CircleAlert size={19} aria-hidden="true" />
                  <h2 id="listing-notice-title">掲載情報について</h2>
                </div>
                <button
                  ref={closeRef}
                  type="button"
                  className="listing-notice-close"
                  aria-label="閉じる"
                  onClick={close}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
              <p>
                掲載されている銘柄の取り扱いや在庫を保証するものではありません。最新の状況は店舗へ直接ご確認ください。
              </p>
            </section>
          </>,
          document.body,
        )}
    </div>
  );
}
