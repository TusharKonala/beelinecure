"use client";

import type { RefObject } from "react";

import { cn } from "@/lib/utils";

/** Same as Set Availability / View Schedule Quick Check date inputs. */
export const quickCheckDateInputClassName =
  "block w-full min-w-0 cursor-pointer rounded-xl border border-[#e5e5e5] bg-white px-4 py-3 font-montserrat text-sm text-[#111111] shadow-sm [color-scheme:light] focus:border-[#2555F3] focus:outline-none focus:ring-2 focus:ring-[#2555F3]/30 md:py-2.5";

type QuickCheckStyleDateFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  minDate?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  clearLabel?: string;
  clearAriaLabel?: string;
  ariaLabel?: string;
  className?: string;
  labelClassName?: string;
};

export function QuickCheckStyleDateField({
  id,
  label,
  value,
  onChange,
  minDate,
  inputRef,
  clearLabel = "Clear",
  clearAriaLabel,
  ariaLabel,
  className,
  labelClassName,
}: QuickCheckStyleDateFieldProps) {
  const d = value.trim();
  return (
    <div className={cn("w-full max-w-[min(100%,14rem)]", className)}>
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={id}
          className={cn(
            "block font-montserrat text-xs font-medium text-[#5E5E5E]",
            labelClassName,
          )}
        >
          {label}
        </label>
        {d ? (
          <button
            type="button"
            className="cursor-pointer shrink-0 font-montserrat text-xs font-medium text-[#2555F3] underline-offset-2 hover:underline"
            onClick={() => onChange("")}
            aria-label={clearAriaLabel ?? `Clear ${label.toLowerCase()}`}
          >
            {clearLabel}
          </button>
        ) : null}
      </div>
      <div className="mt-1.5 w-full cursor-pointer select-none">
        <input
          ref={inputRef}
          id={id}
          type="date"
          min={minDate}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => e.currentTarget.showPicker?.()}
          className={cn(quickCheckDateInputClassName, "mt-0 select-none")}
          aria-label={ariaLabel ?? label}
        />
      </div>
    </div>
  );
}
