"use client";

import { Button, Input, Label, Textarea } from "@/components/ui";
import type { RemInspection } from "@/lib/cig/collateral-inspection";

type Props = {
  value: RemInspection | null;
  onChange: (next: RemInspection) => void;
  onSave: (next: RemInspection) => void;
  saving?: boolean;
  readOnly?: boolean;
  verifierName: string;
};

function ensure(value: RemInspection | null): RemInspection {
  return {
    account: value?.account ?? {},
    titleDetails: {
      ...value?.titleDetails,
      annotatedAtTitle: value?.titleDetails?.annotatedAtTitle?.length
        ? value.titleDetails.annotatedAtTitle
        : ["", "", "", "", ""],
    },
    insurance: value?.insurance ?? {},
    checklist: value?.checklist ?? {},
    others: value?.others?.length ? value.others : ["", "", "", "", ""],
    verifiedBy: value?.verifiedBy ?? null,
  };
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

export function RemInspectionForm({
  value,
  onChange,
  onSave,
  saving,
  readOnly,
  verifierName,
}: Props) {
  const rem = ensure(value);

  function update(patch: Partial<RemInspection>) {
    onChange({ ...rem, ...patch });
  }

  function updateAnnotationLine(index: number, text: string) {
    const lines = [...(rem.titleDetails?.annotatedAtTitle ?? [])];
    lines[index] = text;
    update({ titleDetails: { ...rem.titleDetails, annotatedAtTitle: lines } });
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
          Title Details
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Registered owner at the title"
            value={rem.titleDetails?.registeredOwnerAtTitle}
            disabled={readOnly}
            onChange={(v) =>
              update({
                titleDetails: { ...rem.titleDetails, registeredOwnerAtTitle: v },
              })
            }
          />
          <TextField
            label="Year register"
            value={rem.titleDetails?.yearRegister}
            disabled={readOnly}
            onChange={(v) =>
              update({ titleDetails: { ...rem.titleDetails, yearRegister: v } })
            }
          />
        </div>
        <TextField
          label="Address registered at the title"
          value={rem.titleDetails?.addressRegisteredAtTitle}
          disabled={readOnly}
          onChange={(v) =>
            update({
              titleDetails: { ...rem.titleDetails, addressRegisteredAtTitle: v },
            })
          }
        />
        <div>
          <Label className="text-xs">Annotated at the title</Label>
          <div className="space-y-1">
            {(rem.titleDetails?.annotatedAtTitle ?? []).map((line, i) => (
              <Input
                key={i}
                value={line ?? ""}
                disabled={readOnly}
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
            value={rem.insurance?.insurer}
            disabled={readOnly}
            onChange={(v) => update({ insurance: { ...rem.insurance, insurer: v } })}
          />
          <TextField
            label="Amount insured"
            type="number"
            value={rem.insurance?.amountInsured}
            disabled={readOnly}
            onChange={(v) =>
              update({
                insurance: {
                  ...rem.insurance,
                  amountInsured: v === "" ? null : Number(v),
                },
              })
            }
          />
          <TextField
            label="Type of coverage"
            value={rem.insurance?.typeOfCoverage}
            disabled={readOnly}
            onChange={(v) =>
              update({ insurance: { ...rem.insurance, typeOfCoverage: v } })
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
          Refinancing sheet, kept as-is). Additional property-condition items
          go below.
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
            item={rem.checklist?.[key]}
            disabled={readOnly}
            onChange={(next) =>
              update({ checklist: { ...rem.checklist, [key]: next } })
            }
          />
        ))}

        <div className="pt-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Additional items</Label>
            {!readOnly ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  update({
                    checklist: {
                      ...rem.checklist,
                      additionalItems: [
                        ...(rem.checklist?.additionalItems ?? []),
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
          {(rem.checklist?.additionalItems ?? []).map((item, i) => (
            <div
              key={i}
              className="grid items-center gap-2 border-b border-ink-100 py-2 sm:grid-cols-[1.2fr_auto_auto_2fr]"
            >
              <Input
                placeholder="Item label"
                value={item.label ?? ""}
                disabled={readOnly}
                onChange={(e) => {
                  const items = [...(rem.checklist?.additionalItems ?? [])];
                  items[i] = { ...items[i], label: e.target.value };
                  update({ checklist: { ...rem.checklist, additionalItems: items } });
                }}
              />
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={Boolean(item.working)}
                  disabled={readOnly}
                  onChange={(e) => {
                    const items = [...(rem.checklist?.additionalItems ?? [])];
                    items[i] = {
                      ...items[i],
                      working: e.target.checked,
                      notWorking: e.target.checked ? false : items[i].notWorking,
                    };
                    update({ checklist: { ...rem.checklist, additionalItems: items } });
                  }}
                />
                Working
              </label>
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={Boolean(item.notWorking)}
                  disabled={readOnly}
                  onChange={(e) => {
                    const items = [...(rem.checklist?.additionalItems ?? [])];
                    items[i] = {
                      ...items[i],
                      notWorking: e.target.checked,
                      working: e.target.checked ? false : items[i].working,
                    };
                    update({ checklist: { ...rem.checklist, additionalItems: items } });
                  }}
                />
                Not working
              </label>
              <Input
                placeholder="Remarks"
                value={item.remarks ?? ""}
                disabled={readOnly}
                onChange={(e) => {
                  const items = [...(rem.checklist?.additionalItems ?? [])];
                  items[i] = { ...items[i], remarks: e.target.value };
                  update({ checklist: { ...rem.checklist, additionalItems: items } });
                }}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="font-display text-sm font-semibold text-navy-900">
          Others
        </h3>
        <p className="text-xs text-ink-500">
          Unstructured free-text lines, matching the source sheet.
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
