"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { cn } from "./cn";
import { Input } from "./Input";
import {
  DEFAULT_DIAL_COUNTRY,
  filterDialCountries,
  formatE164,
  type DialCountry,
} from "@/lib/countries/dial-codes";

export type PhoneInputProps = {
  id?: string;
  value: string;
  onChange: (e164: string) => void;
  defaultCountry?: DialCountry;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

export function PhoneInput({
  id,
  value,
  onChange,
  defaultCountry = DEFAULT_DIAL_COUNTRY,
  placeholder = "917 123 4567",
  disabled = false,
  className = "",
}: PhoneInputProps) {
  const [country, setCountry] = useState<DialCountry>(defaultCountry);
  const [national, setNational] = useState("");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const numberRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const filtered = useMemo(() => filterDialCountries(query), [query]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setActiveIndex(0);
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function emit(nextCountry: DialCountry, nextNational: string) {
    onChange(formatE164(nextCountry.dial, nextNational) ?? "");
  }

  function selectCountry(next: DialCountry) {
    setCountry(next);
    setOpen(false);
    setQuery("");
    emit(next, national);
    requestAnimationFrame(() => numberRef.current?.focus());
  }

  function onNationalChange(raw: string) {
    const cleaned = raw.replace(/[^\d\s()-]/g, "");
    setNational(cleaned);
    emit(country, cleaned);
  }

  function onListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!filtered.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % filtered.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const pick = filtered[activeIndex];
      if (pick) selectCountry(pick);
    }
  }

  // Keep internal national in sync if parent clears value
  useEffect(() => {
    if (!value && national) {
      setNational("");
    }
  }, [value, national]);

  return (
    <div ref={rootRef} className={cn("phone-input", className)}>
      <button
        type="button"
        className="phone-input-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`Country code ${country.name} ${country.dial}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="phone-input-flag" aria-hidden>
          {country.flag}
        </span>
        <span className="phone-input-dial mono">{country.dial}</span>
        <svg
          className="phone-input-chevron"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <Input
        ref={numberRef}
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        disabled={disabled}
        placeholder={placeholder}
        value={national}
        onChange={(e) => onNationalChange(e.target.value)}
        className="phone-input-number"
        aria-label="Mobile phone number"
      />

      {open ? (
        <div
          id={listId}
          className="phone-input-menu"
          role="listbox"
          aria-label="Select country"
          onKeyDown={onListKeyDown}
        >
          <div className="phone-input-search">
            <Input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search country or code"
              aria-label="Search countries"
              autoComplete="off"
            />
          </div>
          <div className="phone-input-list">
            {filtered.length === 0 ? (
              <p className="phone-input-empty">No countries found</p>
            ) : (
              filtered.map((c, index) => (
                <button
                  key={c.iso2}
                  type="button"
                  role="option"
                  aria-selected={c.iso2 === country.iso2}
                  className={cn(
                    "phone-input-option",
                    index === activeIndex && "is-active",
                    c.iso2 === country.iso2 && "is-selected",
                  )}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectCountry(c)}
                >
                  <span className="phone-input-flag" aria-hidden>
                    {c.flag}
                  </span>
                  <span className="phone-input-name">{c.name}</span>
                  <span className="phone-input-code mono">{c.dial}</span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
