"use client";

import { useState } from "react";

import { Button, Input, Label, Textarea } from "@/components/ui";
import {
  normalizeRemInspection,
  type RemInspection,
  type RemPropertyEntry,
} from "@/lib/cig/collateral-inspection";

type Props = {
  value: RemInspection | null;
  onChange: (next: RemInspection) => void;
  onSave: (next: RemInspection) => void;
  saving?: boolean;
  readOnly?: boolean;
  verifierName: string;
};

function ensure(value: RemInspection | null): RemInspection {
  const n = normalizeRemInspection(value);
  return {
    account: n.account ?? {},
    properties: n.properties ?? [],
    others: n.others?.length ? n.others : ["", "", "", "", ""],
    verifiedBy: n.verifiedBy ?? null,
  };
}

function emptyProperty(): RemPropertyEntry {
  return {
    titleDetails: { annotatedAtTitle: ["", "", "", "", ""] },
    insurance: {},
    checklist: {},
    legalDescription: {},
  };
}

function propertySummary(p: RemPropertyEntry, index: number): string {
  const owner = p.titleDetails?.registeredOwnerAtTitle?.trim();
  const tct = p.legalDescription?.tctNo?.trim();
  if (tct && owner) return `TCT ${tct} — ${owner}`;
  if (tct) return `TCT ${tct}`;
  if (owner) return owner;
  return `Property ${index + 1}`;
}

function TextField({
  label,
  value,
  onChange,
  disabled,
  type = "text",
}: {
  label: string;
  value: string | number | null | undefined;
  onChange: (v: string) => void;
  disabled?: boolean;
  type?: string;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}

/** Working / Not Working tick-one-of + remarks, same shape CM uses. */
function ChecklistRow({
  label,
  item,
  onChange,
  disabled,
}: {
  label: string;
  item: { working?: boolean | null; notWorking?: boolean | null; remarks?: string | null } | null | undefined;
  onChange: (next: { working?: boolean | null; notWorking?: boolean | null; remarks?: string | null }) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid items-center gap-2 border-b border-ink-100 py-2 sm:grid-cols-[1.2fr_auto_auto_2fr]">
      <p className="text-sm font-medium text-ink-700">{label}</p>
      <label className="flex items-center gap-1 text-xs">
        <input
          type="checkbox"
          checked={Boolean(item?.working)}
          disabled={disabled}
          onChange={(e) =>
            onChange({
              ...item,
              working: e.target.checked,
              notWorking: e.target.checked ? false : item?.notWorking,
            })
          }
        />
        Working
      </label>
      <label className="flex items-center gap-1 text-xs">
        <input
          type="checkbox"
          checked={Boolean(item?.notWorking)}
          disabled={disabled}
          onChange={(e) =>
            onChange({
              ...item,
              notWorking: e.target.checked,
              working: e.target.checked ? false : item?.working,
            })
          }
        />
        Not working
      </label>
      <Input
        placeholder="Remarks"
        value={item?.remarks ?? ""}
        disabled={disabled}
        onChange={(e) => onChange({ ...item, remarks: e.target.value })}
      />
    </div>
  );
}

/** One property's full inspection form — everything that used to be the
 * whole RemInspectionForm body (minus Account/Others, which stay shared
 * across every property on this CI visit), now scoped to one entry. */
function PropertyCard({
  property,
  index,
  expanded,
  onToggleExpand,
  onChange,
  onRemove,
  disabled,
}: {
  property: RemPropertyEntry;
  index: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onChange: (patch: Partial<RemPropertyEntry>) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  function updateAnnotationLine(i: number, text: string) {
    const lines = [...(property.titleDetails?.annotatedAtTitle ?? [])];
    lines[i] = text;
    onChange({ titleDetails: { ...property.titleDetails, annotatedAtTitle: lines } });
  }

  return (
    <div className="rounded-[var(--r-md)] border border-line-soft">
      <div className="flex items-center justify-between gap-2 p-3">
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex flex-1 items-center gap-2 text-left"
          aria-expanded={expanded}
        >
          <span aria-hidden className="text-ink-400">{expanded ? "▾" : "▸"}</span>
          <span className="text-sm font-semibold text-navy-900">
            {propertySummary(property, index)}
          </span>
        </button>
        {!disabled ? (
          <Button
            type="button"
            variant="danger-soft"
            size="sm"
            aria-label={`Remove property ${index + 1}`}
            onClick={onRemove}
          >
            Remove
          </Button>
        ) : null}
      </div>

      {expanded ? (
        <div className="space-y-6 border-t border-line-soft p-3">
          <section className="space-y-3">
            <h3 className="font-display text-sm font-semibold text-navy-900">
              Legal Description
            </h3>
            <p className="text-xs text-ink-500">
              Not on the client&apos;s original CI sheet — added so the
              mortgage documents (location, TCT no., area, technical
              description) have a real source.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Location"
                value={property.legalDescription?.location}
                disabled={disabled}
                onChange={(v) =>
                  onChange({ legalDescription: { ...property.legalDescription, location: v } })
                }
              />
              <TextField
                label="TCT No."
                value={property.legalDescription?.tctNo}
                disabled={disabled}
                onChange={(v) =>
                  onChange({ legalDescription: { ...property.legalDescription, tctNo: v } })
                }
              />
              <TextField
                label="Area (sqm)"
                type="number"
                value={property.legalDescription?.areaSqm}
                disabled={disabled}
                onChange={(v) =>
                  onChange({
                    legalDescription: {
                      ...property.legalDescription,
                      areaSqm: v === "" ? null : Number(v),
                    },
                  })
                }
              />
            </div>
            <div>
              <Label className="text-xs">Technical description</Label>
              <Textarea
                rows={3}
                value={property.legalDescription?.technicalDescription ?? ""}
                disabled={disabled}
                onChange={(e) =>
                  onChange({
                    legalDescription: {
                      ...property.legalDescription,
                      technicalDescription: e.target.value,
                    },
                  })
                }
              />
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="font-display text-sm font-semibold text-navy-900">
              Title Details
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Registered owner at the title"
                value={property.titleDetails?.registeredOwnerAtTitle}
                disabled={disabled}
                onChange={(v) =>
                  onChange({
                    titleDetails: { ...property.titleDetails, registeredOwnerAtTitle: v },
                  })
                }
              />
              <TextField
                label="Year register"
                value={property.titleDetails?.yearRegister}
                disabled={disabled}
                onChange={(v) =>
                  onChange({ titleDetails: { ...property.titleDetails, yearRegister: v } })
                }
              />
            </div>
            <TextField
              label="Address registered at the title"
              value={property.titleDetails?.addressRegisteredAtTitle}
              disabled={disabled}
              onChange={(v) =>
                onChange({
                  titleDetails: { ...property.titleDetails, addressRegisteredAtTitle: v },
                })
              }
            />
            <div>
              <Label className="text-xs">Annotated at the title</Label>
              <div className="space-y-1">
                {(property.titleDetails?.annotatedAtTitle ?? []).map((line, i) => (
                  <Input
                    key={i}
                    value={line ?? ""}
                    disabled={disabled}
                    placeholder={`Line ${i + 1}`}
                    onChange={(e) => updateAnnotationLine(i, e.target.value)}
                  />
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="font-display text-sm font-semibold text-navy-900">
              Insurance
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <TextField
                label="Insurer"
                value={property.insurance?.insurer}
                disabled={disabled}
                onChange={(v) => onChange({ insurance: { ...property.insurance, insurer: v } })}
              />
              <TextField
                label="Amount insured"
                type="number"
                value={property.insurance?.amountInsured}
                disabled={disabled}
                onChange={(v) =>
                  onChange({
                    insurance: {
                      ...property.insurance,
                      amountInsured: v === "" ? null : Number(v),
                    },
                  })
                }
              />
              <TextField
                label="Type of coverage"
                value={property.insurance?.typeOfCoverage}
                disabled={disabled}
                onChange={(v) =>
                  onChange({ insurance: { ...property.insurance, typeOfCoverage: v } })
                }
              />
            </div>
          </section>

          <section className="space-y-1">
            <h3 className="font-display text-sm font-semibold text-navy-900">
              Checklist
            </h3>
            <p className="text-xs text-ink-500">
              Only Paint, CR, Rooms, and Furnitures are pre-labeled on the
              client&apos;s own form (the section header itself still reads
              &quot;Vehicles Check List&quot; — a leftover from the Car
              Refinancing sheet, kept as-is). Additional property-condition
              items go below.
            </p>
            {(
              [
                ["paint", "Paint"],
                ["cr", "CR"],
                ["rooms", "Rooms"],
                ["furnitures", "Furnitures"],
              ] as const
            ).map(([key, label]) => (
              <ChecklistRow
                key={key}
                label={label}
                item={property.checklist?.[key]}
                disabled={disabled}
                onChange={(next) =>
                  onChange({ checklist: { ...property.checklist, [key]: next } })
                }
              />
            ))}

            <div className="pt-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Additional items</Label>
                {!disabled ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      onChange({
                        checklist: {
                          ...property.checklist,
                          additionalItems: [
                            ...(property.checklist?.additionalItems ?? []),
                            { label: "", working: false, notWorking: false, remarks: "" },
                          ],
                        },
                      })
                    }
                  >
                    Add item
                  </Button>
                ) : null}
              </div>
              {(property.checklist?.additionalItems ?? []).map((item, i) => (
                <div
                  key={i}
                  className="grid items-center gap-2 border-b border-ink-100 py-2 sm:grid-cols-[1.2fr_auto_auto_2fr]"
                >
                  <Input
                    placeholder="Item label"
                    value={item.label ?? ""}
                    disabled={disabled}
                    onChange={(e) => {
                      const items = [...(property.checklist?.additionalItems ?? [])];
                      items[i] = { ...items[i], label: e.target.value };
                      onChange({ checklist: { ...property.checklist, additionalItems: items } });
                    }}
                  />
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={Boolean(item.working)}
                      disabled={disabled}
                      onChange={(e) => {
                        const items = [...(property.checklist?.additionalItems ?? [])];
                        items[i] = {
                          ...items[i],
                          working: e.target.checked,
                          notWorking: e.target.checked ? false : items[i].notWorking,
                        };
                        onChange({ checklist: { ...property.checklist, additionalItems: items } });
                      }}
                    />
                    Working
                  </label>
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={Boolean(item.notWorking)}
                      disabled={disabled}
                      onChange={(e) => {
                        const items = [...(property.checklist?.additionalItems ?? [])];
                        items[i] = {
                          ...items[i],
                          notWorking: e.target.checked,
                          working: e.target.checked ? false : items[i].working,
                        };
                        onChange({ checklist: { ...property.checklist, additionalItems: items } });
                      }}
                    />
                    Not working
                  </label>
                  <Input
                    placeholder="Remarks"
                    value={item.remarks ?? ""}
                    disabled={disabled}
                    onChange={(e) => {
                      const items = [...(property.checklist?.additionalItems ?? [])];
                      items[i] = { ...items[i], remarks: e.target.value };
                      onChange({ checklist: { ...property.checklist, additionalItems: items } });
                    }}
                  />
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export function RemInspectionForm({
  value,
  onChange,
  onSave,
  saving,
  readOnly,
  verifierName,
}: Props) {
  const rem = ensure(value);
  const properties = rem.properties ?? [];
  const [expanded, setExpanded] = useState<Set<number>>(
    () => new Set(properties.length <= 1 ? properties.map((_, i) => i) : []),
  );

  function update(patch: Partial<RemInspection>) {
    onChange({ ...rem, ...patch });
  }

  function updateProperty(index: number, patch: Partial<RemPropertyEntry>) {
    const next = properties.map((p, i) => (i === index ? { ...p, ...patch } : p));
    update({ properties: next });
  }

  function addProperty() {
    const next = [...properties, emptyProperty()];
    update({ properties: next });
    setExpanded((prev) => new Set(prev).add(next.length - 1));
  }

  function removeProperty(index: number) {
    update({ properties: properties.filter((_, i) => i !== index) });
    setExpanded((prev) => {
      const next = new Set<number>();
      for (const i of prev) {
        if (i < index) next.add(i);
        else if (i > index) next.add(i - 1);
      }
      return next;
    });
  }

  function updateOtherLine(index: number, text: string) {
    const lines = [...(rem.others ?? [])];
    lines[index] = text;
    update({ others: lines });
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="font-display text-sm font-semibold text-navy-900">
          Account
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Account name"
            value={rem.account?.accountName}
            disabled={readOnly}
            onChange={(v) => update({ account: { ...rem.account, accountName: v } })}
          />
          <TextField
            label="Address"
            value={rem.account?.address}
            disabled={readOnly}
            onChange={(v) => update({ account: { ...rem.account, address: v } })}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-sm font-semibold text-navy-900">
          Properties ({properties.length})
        </h3>
        {properties.length === 0 ? (
          <p className="text-sm text-ink-400">No properties added yet.</p>
        ) : null}
        <div className="space-y-3">
          {properties.map((property, i) => (
            <PropertyCard
              key={i}
              property={property}
              index={i}
              expanded={expanded.has(i)}
              onToggleExpand={() =>
                setExpanded((prev) => {
                  const next = new Set(prev);
                  if (next.has(i)) next.delete(i);
                  else next.add(i);
                  return next;
                })
              }
              onChange={(patch) => updateProperty(i, patch)}
              onRemove={() => removeProperty(i)}
              disabled={readOnly}
            />
          ))}
        </div>
        {!readOnly ? (
          <Button type="button" variant="secondary" size="sm" onClick={addProperty}>
            Add property
          </Button>
        ) : null}
      </section>

      <section className="space-y-2">
        <h3 className="font-display text-sm font-semibold text-navy-900">
          Others
        </h3>
        <p className="text-xs text-ink-500">
          Unstructured free-text lines, matching the source sheet — shared
          across every property on this CI visit.
        </p>
        {(rem.others ?? []).map((line, i) => (
          <Textarea
            key={i}
            rows={1}
            value={line ?? ""}
            disabled={readOnly}
            placeholder={`Line ${i + 1}`}
            onChange={(e) => updateOtherLine(i, e.target.value)}
          />
        ))}
      </section>

      <section className="space-y-2">
        <h3 className="font-display text-sm font-semibold text-navy-900">
          Sign-off
        </h3>
        <TextField
          label="Verified by"
          value={rem.verifiedBy}
          disabled={readOnly}
          onChange={(v) => update({ verifiedBy: v })}
        />
        {!readOnly ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => update({ verifiedBy: verifierName })}
          >
            Fill with my name
          </Button>
        ) : null}
      </section>

      {!readOnly ? (
        <Button type="button" loading={saving} onClick={() => onSave(rem)}>
          Save REM Inspection
        </Button>
      ) : null}
    </div>
  );
}
