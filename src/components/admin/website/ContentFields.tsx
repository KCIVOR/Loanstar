"use client";

import { useId } from "react";

function labelFor(key: string) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}

/** Form controls for known schema fields; never accepts executable HTML or raw JSON. */
export function ContentFields({
  value,
  onChange,
  label,
  template,
  nullableHref = false,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
  label?: string;
  template?: unknown;
  nullableHref?: boolean;
}) {
  const controlId = useId();
  if (typeof value === "string") {
    const multiline = /body|description|quote|subtitle|hint|copyright/i.test(
      label ?? "",
    );
    return (
      <label className="mb-3 block text-sm" htmlFor={controlId}>
        <span className="mb-1 block font-medium">
          {label}
          {nullableHref && label === "Href" ? " (optional)" : ""}
        </span>
        {multiline ? (
          <textarea
            id={controlId}
            className="w-full rounded border border-slate-300 bg-white p-2"
            rows={3}
            value={value}
            onChange={(e) =>
              onChange(
                nullableHref && label === "Href"
                  ? e.target.value || null
                  : e.target.value,
              )
            }
          />
        ) : (
          <input
            id={controlId}
            className="w-full rounded border border-slate-300 bg-white p-2"
            value={value}
            onChange={(e) =>
              onChange(
                nullableHref && label === "Href"
                  ? e.target.value || null
                  : e.target.value,
              )
            }
          />
        )}
      </label>
    );
  }
  if (typeof value === "boolean") {
    return (
      <label className="mb-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
        />
        {label}
      </label>
    );
  }
  if (value === null) {
    // Nullable footer destinations are deliberate labels until a destination is supplied.
    return (
      <label className="mb-3 block text-sm">
        <span className="mb-1 block font-medium">{label} (optional)</span>
        <input
          className="w-full rounded border p-2"
          value=""
          onChange={(e) => onChange(e.target.value || null)}
        />
      </label>
    );
  }
  if (Array.isArray(value)) {
    const itemTemplate = Array.isArray(template) ? template[0] : undefined;
    const move = (index: number, delta: number) => {
      const next = [...value];
      [next[index], next[index + delta]] = [next[index + delta], next[index]];
      onChange(next);
    };
    return (
      <fieldset className="mb-5 rounded border border-slate-200 p-3">
        <legend className="px-1 text-sm font-semibold">{label}</legend>
        {value.map((item, index) => (
          <div
            key={
              typeof item === "object" && item !== null && "id" in item
                ? String(item.id)
                : index
            }
            className="mb-3 rounded bg-slate-50 p-3"
          >
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
              <span>Item {index + 1}</span>
              <button
                type="button"
                className="rounded border px-2 py-1"
                disabled={index === 0}
                onClick={() => move(index, -1)}
                aria-label={`Move ${label} item ${index + 1} up`}
              >
                Move up
              </button>
              <button
                type="button"
                className="rounded border px-2 py-1"
                disabled={index === value.length - 1}
                onClick={() => move(index, 1)}
                aria-label={`Move ${label} item ${index + 1} down`}
              >
                Move down
              </button>
              <button
                type="button"
                className="rounded border px-2 py-1 text-red-700"
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              >
                Remove item
              </button>
            </div>
            <ContentFields
              nullableHref={nullableHref}
              value={item}
              template={itemTemplate}
              onChange={(next) =>
                onChange(value.map((v, i) => (i === index ? next : v)))
              }
            />
          </div>
        ))}
        {(itemTemplate !== undefined || value[0] !== undefined) && (
          <button
            type="button"
            className="rounded border px-3 py-2 text-sm"
            onClick={() => {
              const item = structuredClone(itemTemplate ?? value[0]);
              if (item && typeof item === "object" && "id" in item)
                item.id = `item-${crypto.randomUUID()}`;
              onChange([...value, item]);
            }}
          >
            Add {label?.replace(/s$/, "").toLowerCase() ?? "item"}
          </button>
        )}
      </fieldset>
    );
  }
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    const defaults =
      template && typeof template === "object"
        ? (template as Record<string, unknown>)
        : {};
    return (
      <div>
        {label && <h3 className="mb-3 font-semibold">{label}</h3>}
        {Object.entries(object)
          .filter(([key]) => !["id", "type", "schemaVersion"].includes(key))
          .map(([key, field]) => {
            if (key === "icon" && typeof field === "string") {
              return (
                <label className="mb-3 block text-sm" key={key}>
                  Icon
                  <select
                    className="ml-2 rounded border p-2"
                    value={field}
                    onChange={(e) =>
                      onChange({ ...object, [key]: e.target.value })
                    }
                  >
                    {["globe", "money", "repeat"].map((icon) => (
                      <option key={icon}>{icon}</option>
                    ))}
                  </select>
                </label>
              );
            }
            return (
              <ContentFields
                nullableHref={nullableHref}
                key={key}
                label={labelFor(key)}
                value={field}
                template={defaults[key]}
                onChange={(next) => onChange({ ...object, [key]: next })}
              />
            );
          })}
      </div>
    );
  }
  return null;
}
