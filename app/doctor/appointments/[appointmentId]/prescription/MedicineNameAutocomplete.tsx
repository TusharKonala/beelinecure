"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  searchMedicineNames,
  type LocalMedicineSuggestion,
} from "@/lib/medicine-search";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

const DEBOUNCE_MS = 75;
const MIN_QUERY_LENGTH = 1;

export function MedicineNameAutocomplete({
  value,
  onChange,
  placeholder = "Medicine name",
  className,
}: Props) {
  const [suggestions, setSuggestions] = useState<LocalMedicineSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // True only while we're applying a suggestion the user just selected, so we
  // don't immediately re-open the popup from the change event.
  const justSelectedRef = useRef(false);
  const listboxId = useId();

  useEffect(() => {
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }
    const trimmed = value.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsLoading(true);
      const results = await searchMedicineNames(trimmed, controller.signal);
      if (controller.signal.aborted) return;
      setSuggestions(results);
      setIsOpen(results.length > 0);
      // Do not auto-select first option; Enter should keep free text unless
      // doctor explicitly navigates/selects a suggestion.
      setHighlightIndex(-1);
      setHasSearched(true);
      setIsLoading(false);
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
      setIsLoading(false);
    };
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function applySuggestion(suggestion: LocalMedicineSuggestion) {
    justSelectedRef.current = true;
    onChange(suggestion.name);
    setIsOpen(false);
    setSuggestions([]);
    setHighlightIndex(-1);
    setHasSearched(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || suggestions.length === 0) {
      if (event.key === "ArrowDown" && suggestions.length > 0) {
        event.preventDefault();
        setIsOpen(true);
        setHighlightIndex(0);
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightIndex((prev) => (prev + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightIndex((prev) =>
        prev <= 0 ? suggestions.length - 1 : prev - 1,
      );
    } else if (event.key === "Enter") {
      if (highlightIndex >= 0 && highlightIndex < suggestions.length) {
        event.preventDefault();
        applySuggestion(suggestions[highlightIndex]!);
      } else {
        // Allow free-text submit behavior when no suggestion is explicitly chosen.
        setIsOpen(false);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          highlightIndex >= 0
            ? `${listboxId}-option-${highlightIndex}`
            : undefined
        }
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          const nextValue = e.target.value;
          onChange(nextValue);
          setHasSearched(false);
          if (nextValue.trim().length < MIN_QUERY_LENGTH) {
            setIsOpen(false);
            setHighlightIndex(-1);
          }
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          setIsFocused(true);
          if (suggestions.length > 0) setIsOpen(true);
        }}
        onBlur={() => {
          // Defer hiding so click-on-suggestion (mousedown handler) still
          // fires before this clears the dropdown.
          setTimeout(() => {
            setIsFocused(false);
            setHasSearched(false);
            setIsOpen(false);
          }, 100);
        }}
        className={className}
        autoComplete="off"
        spellCheck={false}
      />
      {isOpen && suggestions.length > 0 ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-xl border border-[#e5e5e5] bg-white py-1 shadow-lg"
        >
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.name}
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={index === highlightIndex}
              onMouseDown={(event) => {
                event.preventDefault();
                applySuggestion(suggestion);
              }}
              onMouseEnter={() => setHighlightIndex(index)}
              className={`cursor-pointer px-3 py-2 font-montserrat text-sm ${
                index === highlightIndex
                  ? "bg-[#2555F3]/10 text-[#2555F3]"
                  : "text-[#333333]"
              }`}
            >
              <span className="block text-[#333333]">{suggestion.name}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {isFocused &&
      !isLoading &&
      hasSearched &&
      value.trim().length >= MIN_QUERY_LENGTH &&
      suggestions.length === 0 ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 font-montserrat text-sm text-[#5E5E5E] shadow-lg">
          No matches found.
        </div>
      ) : null}
      {isLoading && value.trim().length >= MIN_QUERY_LENGTH ? (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-montserrat text-xs text-[#5E5E5E]">
          ...
        </span>
      ) : null}
    </div>
  );
}
