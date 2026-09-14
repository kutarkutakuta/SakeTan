"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";

export function AvailabilityInfo() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const tooltipId = useId();

  useEffect(() => {
    if (!open) return;
    const closeFromOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.blur();
    };
    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeFromKeyboard);
    };
  }, [open]);

  return (
    <span
      ref={root}
      className={`availability-info${open ? " open" : ""}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="availability-info-trigger"
        aria-label="取扱情報の変更について"
        aria-describedby={tooltipId}
        onClick={() => {
          if (open) {
            setOpen(false);
            trigger.current?.blur();
          } else {
            setOpen(true);
          }
        }}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          setOpen(false);
          trigger.current?.blur();
        }}
      >
        <Info size={19} aria-hidden="true" />
      </button>
      <span id={tooltipId} className="availability-tooltip" role="tooltip">
        ログインせず変更できます。変更しても過去の投稿・更新履歴は残ります。
      </span>
    </span>
  );
}
