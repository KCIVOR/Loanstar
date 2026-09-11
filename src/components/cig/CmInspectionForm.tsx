"use client";

import { useState } from "react";

import { Button, Input, Label } from "@/components/ui";
import {
  normalizeCmInspection,
  type CmInspection,
  type CmVehicleEntry,
  type CollateralChecklistItem,
  type CollateralConditionItem,
  type CollateralYesNoItem,
} from "@/lib/cig/collateral-inspection";

type Props = {
  value: CmInspection | null;
  onChange: (next: CmInspection) => void;
  onSave: (next: CmInspection) => void;
  saving?: boolean;
  readOnly?: boolean;
  verifierName: string;
};

function ensure(value: CmInspection | null): CmInspection {
  const n = normalizeCmInspection(value);
  return { account: n.account ?? {}, vehicles: n.vehicles ?? [], verifiedBy: n.verifiedBy ?? null };
}

function emptyVehicle(): CmVehicleEntry {
  return {
    orCrDetails: {},
    registration: {},
    insurance: {},
    odometerDuringInspection: null,
    vehiclesChecklist: {},
    others: {},
    vehiclesCondition: {},
  };
}

function vehicleSummary(v: CmVehicleEntry, index: number): string {
  const plate = v.orCrDetails?.plateNumber?.trim();
  const model = v.orCrDetails?.makeYearModel?.trim();
  if (plate && model) return `${model} — ${plate}`;
  if (plate) return plate;
  if (model) return model;
  return `Vehicle ${index + 1}`;
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

/** Working / Not Working tick-one-of + remarks — used for the 16-row
 * Vehicles Checklist section. */
function ChecklistRow({
  label,
  item,
  onChange,
  disabled,
}: {
  label: string;
  item: CollateralChecklistItem | null | undefined;
  onChange: (next: CollateralChecklistItem) => void;
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

/** Yes / No tick-one-of + remarks — used for the Others sub-groups. */
function YesNoRow({
  label,
  item,
  onChange,
  disabled,
}: {
  label: string;
  item: CollateralYesNoItem | null | undefined;
  onChange: (next: CollateralYesNoItem) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid items-center gap-2 border-b border-ink-100 py-2 sm:grid-cols-[1.2fr_auto_auto_2fr]">
      <p className="text-sm font-medium text-ink-700">{label}</p>
      <label className="flex items-center gap-1 text-xs">
        <input
          type="checkbox"
          checked={Boolean(item?.yes)}
          disabled={disabled}
          onChange={(e) =>
            onChange({
              ...item,
              yes: e.target.checked,
              no: e.target.checked ? false : item?.no,
            })
          }
        />
        Yes
      </label>
      <label className="flex items-center gap-1 text-xs">
        <input
          type="checkbox"
          checked={Boolean(item?.no)}
          disabled={disabled}
          onChange={(e) =>
            onChange({
              ...item,
              no: e.target.checked,
              yes: e.target.checked ? false : item?.yes,
            })
          }
        />
        No
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

/** Good / Fair / Poor tick-one-of + remarks — used for the Vehicles Condition grid. */
function ConditionRow({
  label,
  item,
  onChange,
  disabled,
}: {
  label: string;
  item: CollateralConditionItem | null | undefined;
  onChange: (next: CollateralConditionItem) => void;
  disabled?: boolean;
}) {
  function setOnly(key: "good" | "fair" | "poor", checked: boolean) {
    onChange({
      ...item,
      good: key === "good" ? checked : false,
      fair: key === "fair" ? checked : false,
      poor: key === "poor" ? checked : false,
    });
  }
  return (
    <div className="grid items-center gap-2 border-b border-ink-100 py-2 sm:grid-cols-[1.2fr_auto_auto_auto_2fr]">
      <p className="text-sm font-medium text-ink-700">{label}</p>
      {(["good", "fair", "poor"] as const).map((key) => (
        <label key={key} className="flex items-center gap-1 text-xs capitalize">
          <input
            type="checkbox"
            checked={Boolean(item?.[key])}
            disabled={disabled}
            onChange={(e) => setOnly(key, e.target.checked)}
          />
          {key}
        </label>
      ))}
      <Input
        placeholder="Remarks"
        value={item?.remarks ?? ""}
        disabled={disabled}
        onChange={(e) => onChange({ ...item, remarks: e.target.value })}
      />
    </div>
  );
}

const VEHICLES_CHECKLIST_ROWS: Array<{
  key: keyof NonNullable<CmVehicleEntry["vehiclesChecklist"]>;
  label: string;
}> = [
  { key: "wipers", label: "Wipers" },
  { key: "battery", label: "Battery" },
  { key: "coolant", label: "Coolant (Min or Low)" },
  { key: "radio", label: "Radio" },
  { key: "sideMirror", label: "Side Mirror" },
  { key: "windows", label: "Windows" },
  { key: "lighter", label: "Lighter" },
  { key: "aircon", label: "Aircon" },
  { key: "headLights", label: "Head Lights" },
  { key: "high", label: "High" },
  { key: "low", label: "Low" },
  { key: "cabinLights", label: "Cabin Lights" },
  { key: "shocksAbsorber", label: "Shocks Absorber" },
  { key: "brakeFluid", label: "Brake Fluid" },
  { key: "horn", label: "Horn" },
  { key: "doors", label: "Doors" },
];

const VEHICLES_CONDITION_ROWS: Array<{
  key: keyof NonNullable<CmVehicleEntry["vehiclesCondition"]>;
  label: string;
}> = [
  { key: "engine", label: "Engine" },
  { key: "bumper", label: "Bumper" },
  { key: "body", label: "Body" },
  { key: "grills", label: "Grills" },
  // The source sheet lists "Body" a second time — kept as a distinct field
  // (bodySecond) rather than silently merged, per the extraction doc.
  { key: "bodySecond", label: "Body (2)" },
  { key: "fender", label: "Fender" },
  { key: "paint", label: "Paint" },
  { key: "floorMatting", label: "Floor Matting" },
  { key: "indoorRoofCeiling", label: "Indoor Roof Ceiling" },
  { key: "upholster", label: "Upholster" },
  { key: "differentialBox", label: "Differential Box" },
];

/** One vehicle's full inspection form — everything that used to be the whole
 * CmInspectionForm body, now scoped to a single repeatable entry. */
function VehicleCard({
  vehicle,
  index,
  expanded,
  onToggleExpand,
  onChange,
  onRemove,
  disabled,
}: {
  vehicle: CmVehicleEntry;
  index: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onChange: (patch: Partial<CmVehicleEntry>) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
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
            {vehicleSummary(vehicle, index)}
          </span>
        </button>
        {!disabled ? (
          <Button
            type="button"
            variant="danger-soft"
            size="sm"
            aria-label={`Remove vehicle ${index + 1}`}
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
              OR/CR Details
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Make / Year / Model"
                value={vehicle.orCrDetails?.makeYearModel}
                disabled={disabled}
                onChange={(v) =>
                  onChange({ orCrDetails: { ...vehicle.orCrDetails, makeYearModel: v } })
                }
              />
              <TextField
                label="MV File"
                value={vehicle.orCrDetails?.mvFile}
                disabled={disabled}
                onChange={(v) => onChange({ orCrDetails: { ...vehicle.orCrDetails, mvFile: v } })}
              />
              <TextField
                label="Plate number"
                value={vehicle.orCrDetails?.plateNumber}
                disabled={disabled}
                onChange={(v) =>
                  onChange({ orCrDetails: { ...vehicle.orCrDetails, plateNumber: v } })
                }
              />
              <TextField
                label="CR No."
                value={vehicle.orCrDetails?.crNo}
                disabled={disabled}
                onChange={(v) => onChange({ orCrDetails: { ...vehicle.orCrDetails, crNo: v } })}
              />
              <TextField
                label="Engine no."
                value={vehicle.orCrDetails?.engineNo}
                disabled={disabled}
                onChange={(v) =>
                  onChange({ orCrDetails: { ...vehicle.orCrDetails, engineNo: v } })
                }
              />
              <TextField
                label="Chasis no."
                value={vehicle.orCrDetails?.chasisNo}
                disabled={disabled}
                onChange={(v) =>
                  onChange({ orCrDetails: { ...vehicle.orCrDetails, chasisNo: v } })
                }
              />
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="font-display text-sm font-semibold text-navy-900">
              Registration
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Registered owner"
                value={vehicle.registration?.registeredOwner}
                disabled={disabled}
                onChange={(v) =>
                  onChange({ registration: { ...vehicle.registration, registeredOwner: v } })
                }
              />
              <TextField
                label="Address registered"
                value={vehicle.registration?.addressRegistered}
                disabled={disabled}
                onChange={(v) =>
                  onChange({
                    registration: { ...vehicle.registration, addressRegistered: v },
                  })
                }
              />
              <TextField
                label="Encumbered to"
                value={vehicle.registration?.encumberedTo}
                disabled={disabled}
                onChange={(v) =>
                  onChange({ registration: { ...vehicle.registration, encumberedTo: v } })
                }
              />
              <TextField
                label="LTO address"
                value={vehicle.registration?.ltoAddress}
                disabled={disabled}
                onChange={(v) =>
                  onChange({ registration: { ...vehicle.registration, ltoAddress: v } })
                }
              />
              <TextField
                label="OR No."
                value={vehicle.registration?.orNo}
                disabled={disabled}
                onChange={(v) =>
                  onChange({ registration: { ...vehicle.registration, orNo: v } })
                }
              />
              <TextField
                label="OR Date"
                type="date"
                value={vehicle.registration?.orDate}
                disabled={disabled}
                onChange={(v) =>
                  onChange({ registration: { ...vehicle.registration, orDate: v } })
                }
              />
              <TextField
                label="Amount"
                type="number"
                value={vehicle.registration?.amount}
                disabled={disabled}
                onChange={(v) =>
                  onChange({
                    registration: { ...vehicle.registration, amount: v === "" ? null : Number(v) },
                  })
                }
              />
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="font-display text-sm font-semibold text-navy-900">
              Insurance
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <TextField
                label="Insurer"
                value={vehicle.insurance?.insurer}
                disabled={disabled}
                onChange={(v) => onChange({ insurance: { ...vehicle.insurance, insurer: v } })}
              />
              <TextField
                label="Amount insured"
                type="number"
                value={vehicle.insurance?.amountInsured}
                disabled={disabled}
                onChange={(v) =>
                  onChange({
                    insurance: {
                      ...vehicle.insurance,
                      amountInsured: v === "" ? null : Number(v),
                    },
                  })
                }
              />
              <TextField
                label="Type of coverage"
                value={vehicle.insurance?.typeOfCoverage}
                disabled={disabled}
                onChange={(v) =>
                  onChange({ insurance: { ...vehicle.insurance, typeOfCoverage: v } })
                }
              />
            </div>
            <TextField
              label="Odometer during inspection"
              type="number"
              value={vehicle.odometerDuringInspection}
              disabled={disabled}
              onChange={(v) =>
                onChange({ odometerDuringInspection: v === "" ? null : Number(v) })
              }
            />
          </section>

          <section className="space-y-1">
            <h3 className="font-display text-sm font-semibold text-navy-900">
              Vehicles Check List
            </h3>
            {VEHICLES_CHECKLIST_ROWS.map((row) => (
              <ChecklistRow
                key={row.key}
                label={row.label}
                item={vehicle.vehiclesChecklist?.[row.key]}
                disabled={disabled}
                onChange={(next) =>
                  onChange({
                    vehiclesChecklist: { ...vehicle.vehiclesChecklist, [row.key]: next },
                  })
                }
              />
            ))}
          </section>

          <section className="space-y-4">
            <h3 className="font-display text-sm font-semibold text-navy-900">
              Others
            </h3>
            <div>
              <p className="mb-1 text-xs font-medium text-ink-600">Keys</p>
              {(
                [
                  ["remote", "Remote"],
                  ["ignition", "Ignition"],
                  ["keyless", "Key less"],
                ] as const
              ).map(([key, label]) => (
                <YesNoRow
                  key={key}
                  label={label}
                  item={vehicle.others?.keys?.[key]}
                  disabled={disabled}
                  onChange={(next) =>
                    onChange({
                      others: {
                        ...vehicle.others,
                        keys: { ...vehicle.others?.keys, [key]: next },
                      },
                    })
                  }
                />
              ))}
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-ink-600">Speedometer</p>
              {(
                [
                  ["analog", "Analog"],
                  ["digital", "Digital"],
                ] as const
              ).map(([key, label]) => (
                <YesNoRow
                  key={key}
                  label={label}
                  item={vehicle.others?.speedometer?.[key]}
                  disabled={disabled}
                  onChange={(next) =>
                    onChange({
                      others: {
                        ...vehicle.others,
                        speedometer: { ...vehicle.others?.speedometer, [key]: next },
                      },
                    })
                  }
                />
              ))}
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-ink-600">Steering Wheel</p>
              {(
                [
                  ["power", "Power"],
                  ["nonePower", "None Power"],
                ] as const
              ).map(([key, label]) => (
                <YesNoRow
                  key={key}
                  label={label}
                  item={vehicle.others?.steeringWheel?.[key]}
                  disabled={disabled}
                  onChange={(next) =>
                    onChange({
                      others: {
                        ...vehicle.others,
                        steeringWheel: { ...vehicle.others?.steeringWheel, [key]: next },
                      },
                    })
                  }
                />
              ))}
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-ink-600">Tires</p>
              {(
                [
                  ["ordinary", "Ordinary"],
                  ["mags", "Mags"],
                ] as const
              ).map(([key, label]) => (
                <YesNoRow
                  key={key}
                  label={label}
                  item={vehicle.others?.tires?.[key]}
                  disabled={disabled}
                  onChange={(next) =>
                    onChange({
                      others: {
                        ...vehicle.others,
                        tires: { ...vehicle.others?.tires, [key]: next },
                      },
                    })
                  }
                />
              ))}
              <div className="grid gap-2 pt-2 sm:grid-cols-2">
                <TextField
                  label="Thread of tires %"
                  type="number"
                  value={vehicle.others?.tires?.threadOfTiresPercent}
                  disabled={disabled}
                  onChange={(v) =>
                    onChange({
                      others: {
                        ...vehicle.others,
                        tires: {
                          ...vehicle.others?.tires,
                          threadOfTiresPercent: v === "" ? null : Number(v),
                        },
                      },
                    })
                  }
                />
                <TextField
                  label="Remarks"
                  value={vehicle.others?.tires?.remarks}
                  disabled={disabled}
                  onChange={(v) =>
                    onChange({
                      others: {
                        ...vehicle.others,
                        tires: { ...vehicle.others?.tires, remarks: v },
                      },
                    })
                  }
                />
              </div>
            </div>
          </section>

          <section className="space-y-1">
            <h3 className="font-display text-sm font-semibold text-navy-900">
              Vehicles Condition
            </h3>
            {VEHICLES_CONDITION_ROWS.map((row) => (
              <ConditionRow
                key={row.key}
                label={row.label}
                item={vehicle.vehiclesCondition?.[row.key]}
                disabled={disabled}
                onChange={(next) =>
                  onChange({
                    vehiclesCondition: { ...vehicle.vehiclesCondition, [row.key]: next },
                  })
                }
              />
            ))}
          </section>
        </div>
      ) : null}
    </div>
  );
}

export function CmInspectionForm({
  value,
  onChange,
  onSave,
  saving,
  readOnly,
  verifierName,
}: Props) {
  const cm = ensure(value);
  const vehicles = cm.vehicles ?? [];
  // Presentation-only — which cards are expanded. New/only vehicle starts
  // expanded; a read-only view with several vehicles starts collapsed so the
  // reviewer isn't scrolling past thousands of pixels of checklist rows.
  const [expanded, setExpanded] = useState<Set<number>>(
    () => new Set(vehicles.length <= 1 ? vehicles.map((_, i) => i) : []),
  );

  function update(patch: Partial<CmInspection>) {
    onChange({ ...cm, ...patch });
  }

  function updateVehicle(index: number, patch: Partial<CmVehicleEntry>) {
    const next = vehicles.map((v, i) => (i === index ? { ...v, ...patch } : v));
    update({ vehicles: next });
  }

  function addVehicle() {
    const next = [...vehicles, emptyVehicle()];
    update({ vehicles: next });
    setExpanded((prev) => new Set(prev).add(next.length - 1));
  }

  function removeVehicle(index: number) {
    update({ vehicles: vehicles.filter((_, i) => i !== index) });
    setExpanded((prev) => {
      const next = new Set<number>();
      for (const i of prev) {
        if (i < index) next.add(i);
        else if (i > index) next.add(i - 1);
      }
      return next;
    });
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
            value={cm.account?.accountName}
            disabled={readOnly}
            onChange={(v) =>
              update({ account: { ...cm.account, accountName: v } })
            }
          />
          <TextField
            label="Address"
            value={cm.account?.address}
            disabled={readOnly}
            onChange={(v) => update({ account: { ...cm.account, address: v } })}
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold text-navy-900">
            Vehicles ({vehicles.length})
          </h3>
        </div>
        {vehicles.length === 0 ? (
          <p className="text-sm text-ink-400">No vehicles added yet.</p>
        ) : null}
        <div className="space-y-3">
          {vehicles.map((vehicle, i) => (
            <VehicleCard
              key={i}
              vehicle={vehicle}
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
              onChange={(patch) => updateVehicle(i, patch)}
              onRemove={() => removeVehicle(i)}
              disabled={readOnly}
            />
          ))}
        </div>
        {!readOnly ? (
          <Button type="button" variant="secondary" size="sm" onClick={addVehicle}>
            Add vehicle
          </Button>
        ) : null}
      </section>

      <section className="space-y-2">
        <h3 className="font-display text-sm font-semibold text-navy-900">
          Sign-off
        </h3>
        <TextField
          label="Verified by"
          value={cm.verifiedBy}
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
        <Button type="button" loading={saving} onClick={() => onSave(cm)}>
          Save CM Inspection
        </Button>
      ) : null}
    </div>
  );
}
