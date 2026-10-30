"use client";

import type { WebsiteSection } from "@/lib/website/schema";
import { DEFAULT_WEBSITE } from "@/lib/website/default-content";
import { ContentFields } from "./ContentFields";

export function SectionFields({
  section,
  onChange,
}: {
  section: WebsiteSection;
  onChange: (value: WebsiteSection) => void;
}) {
  const { enabled, ...fields } = section;
  const original = DEFAULT_WEBSITE.landing.sections.find(
    (s) => s.id === section.id,
  );
  return (
    <ContentFields
      value={fields}
      template={original}
      onChange={(next) =>
        onChange({ ...(next as typeof fields), enabled } as WebsiteSection)
      }
    />
  );
}
