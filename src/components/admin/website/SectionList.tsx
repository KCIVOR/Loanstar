"use client";

import type { WebsiteSection } from "@/lib/website/schema";
import { SectionFields } from "./SectionFields";

export function SectionList({
  sections,
  onChange,
}: {
  sections: WebsiteSection[];
  onChange: (sections: WebsiteSection[]) => void;
}) {
  function move(index: number, delta: number) {
    const next = [...sections];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    onChange(next);
  }
  return (
    <div>
      <p className="mb-4 text-sm text-slate-600">
        Hero stays first. To hide a section, also remove links to its anchor
        from navigation, buttons and footer; validation prevents publishing
        broken links.
      </p>
      {sections.map((section, index) => (
        <details
          key={section.id}
          className="mb-4 rounded border border-slate-200 bg-white p-4"
          open={index === 0}
        >
          <summary className="cursor-pointer font-semibold">
            {section.kicker || section.type} {!section.enabled && "(hidden)"}
          </summary>
          <div className="my-4 flex flex-wrap items-center gap-3 text-sm">
            <label>
              <input
                type="checkbox"
                checked={section.enabled}
                disabled={section.type === "hero"}
                onChange={(e) =>
                  onChange(
                    sections.map((s) =>
                      s.id === section.id
                        ? { ...s, enabled: e.target.checked }
                        : s,
                    ),
                  )
                }
              />{" "}
              Show section
            </label>
            <button
              type="button"
              className="rounded border px-2 py-1"
              disabled={index < 2}
              onClick={() => move(index, -1)}
              aria-label={`Move ${section.kicker} up`}
            >
              Move up
            </button>
            <button
              type="button"
              className="rounded border px-2 py-1"
              disabled={index === 0 || index === sections.length - 1}
              onClick={() => move(index, 1)}
              aria-label={`Move ${section.kicker} down`}
            >
              Move down
            </button>
          </div>
          <SectionFields
            section={section}
            onChange={(next) =>
              onChange(sections.map((s) => (s.id === section.id ? next : s)))
            }
          />
        </details>
      ))}
    </div>
  );
}
