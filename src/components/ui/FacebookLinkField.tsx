import { facebookHref } from "@/lib/facebook-link";
import { Input } from "./Input";
import { Label } from "./Label";
import { cn } from "./cn";

const LINK_CLASS =
  "text-teal-700 underline-offset-2 hover:underline pointer-events-auto";

export function FacebookLinkText({
  value,
  className = "",
}: {
  value: string | null | undefined;
  className?: string;
}) {
  const text = (value ?? "").trim();
  if (!text) return null;
  const href = facebookHref(text);
  if (!href) return <>{text}</>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(LINK_CLASS, className)}
    >
      {text}
    </a>
  );
}

export function FacebookLinkField({
  id,
  label = "Facebook link",
  value,
  onChange,
  optTag,
  required = false,
  disabled = false,
}: {
  id?: string;
  label?: string;
  value: string;
  onChange?: (v: string) => void;
  optTag?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const href = facebookHref(value);

  return (
    <div>
      <Label htmlFor={id} required={required}>
        {label}
        {optTag ? (
          <span className="ml-1 font-normal text-ink-400">{optTag}</span>
        ) : null}
      </Label>
      {disabled && href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto flex h-10 w-full items-center rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm font-semibold text-teal-700 underline-offset-2 hover:underline"
        >
          {value}
        </a>
      ) : (
        <div className="relative">
          <Input
            id={id}
            type="text"
            value={value}
            disabled={disabled}
            onChange={onChange ? (e) => onChange(e.target.value) : undefined}
            className={href ? "pr-14" : undefined}
          />
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-teal-700 hover:underline pointer-events-auto"
              aria-label="Open Facebook link"
            >
              Open
            </a>
          ) : null}
        </div>
      )}
    </div>
  );
}
