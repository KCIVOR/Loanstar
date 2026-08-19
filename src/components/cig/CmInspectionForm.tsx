"use client";

import { Button, Input, Label } from "@/components/ui";
import type {
  CmInspection,
  CollateralChecklistItem,
  CollateralConditionItem,
  CollateralYesNoItem,
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
  return {
    account: value?.account ?? {},
    orCrDetails: value?.orCrDetails ?? {},
    registration: value?.registration ?? {},
    insurance: value?.insurance ?? {},
    odometerDuringInspection: value?.odometerDuringInspection ?? null,
    vehiclesChecklist: value?.vehiclesChecklist ?? {},
    others: value?.others ?? {},
    vehiclesCondition: value?.vehiclesCondition ?? {},
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
  key: keyof NonNullable<CmInspection["vehiclesChecklist"]>;
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
  key: keyof NonNullable<CmInspection["vehiclesCondition"]>;
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

export function CmInspectionForm({
  value,
  onChange,
  onSave,
  saving,
  readOnly,
  verifierName,
}: Props) {
  const cm = ensure(value);

  function update(patch: Partial<CmInspection>) {
    onChange({ ...cm, ...patch });
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
        <h3 className="font-display text-sm font-semibold text-navy-900">
          OR/CR Details
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="MV File"
            value={cm.orCrDetails?.mvFile}
            disabled={readOnly}
            onChange={(v) =>
              update({ orCrDetails: { ...cm.orCrDetails, mvFile: v } })
            }
          />
          <TextField
            label="Plate number"
            value={cm.orCrDetails?.plateNumber}
            disabled={readOnly}
            onChange={(v) =>
              update({ orCrDetails: { ...cm.orCrDetails, plateNumber: v } })
            }
          />
          <TextField
            label="Engine no."
            value={cm.orCrDetails?.engineNo}
            disabled={readOnly}
            onChange={(v) =>
              update({ orCrDetails: { ...cm.orCrDetails, engineNo: v } })
            }
          />
          <TextField
            label="Chasis no."
            value={cm.orCrDetails?.chasisNo}
            disabled={readOnly}
            onChange={(v) =>
              update({ orCrDetails: { ...cm.orCrDetails, chasisNo: v } })
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
            value={cm.registration?.registeredOwner}
            disabled={readOnly}
            onChange={(v) =>
              update({ registration: { ...cm.registration, registeredOwner: v } })
            }
          />
          <TextField
            label="Address registered"
            value={cm.registration?.addressRegistered}
            disabled={readOnly}
            onChange={(v) =>
              update({
                registration: { ...cm.registration, addressRegistered: v },
              })
            }
          />
          <TextField
            label="Encumbered to"
            value={cm.registration?.encumberedTo}
            disabled={readOnly}
            onChange={(v) =>
              update({ registration: { ...cm.registration, encumberedTo: v } })
            }
          />
          <TextField
            label="LTO address"
            value={cm.registration?.ltoAddress}
            disabled={readOnly}
            onChange={(v) =>
              update({ registration: { ...cm.registration, ltoAddress: v } })
            }
          />
          <TextField
            label="OR No."
            value={cm.registration?.orNo}
            disabled={readOnly}
            onChange={(v) =>
              update({ registration: { ...cm.registration, orNo: v } })
            }
          />
          <TextField
            label="OR Date"
            type="date"
            value={cm.registration?.orDate}
            disabled={readOnly}
            onChange={(v) =>
              update({ registration: { ...cm.registration, orDate: v } })
            }
          />
          <TextField
            label="Amount"
            type="number"
            value={cm.registration?.amount}
            disabled={readOnly}
            onChange={(v) =>
              update({
                registration: { ...cm.registration, amount: v === "" ? null : Number(v) },
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
            value={cm.insurance?.insurer}
            disabled={readOnly}
            onChange={(v) => update({ insurance: { ...cm.insurance, insurer: v } })}
          />
          <TextField
            label="Amount insured"
            type="number"
            value={cm.insurance?.amountInsured}
            disabled={readOnly}
            onChange={(v) =>
              update({
                insurance: {
                  ...cm.insurance,
                  amountInsured: v === "" ? null : Number(v),
                },
              })
            }
          />
          <TextField
            label="Type of coverage"
            value={cm.insurance?.typeOfCoverage}
            disabled={readOnly}
            onChange={(v) =>
              update({ insurance: { ...cm.insurance, typeOfCoverage: v } })
            }
          />
        </div>
        <TextField
          label="Odometer during inspection"
          type="number"
          value={cm.odometerDuringInspection}
          disabled={readOnly}
          onChange={(v) =>
            update({ odometerDuringInspection: v === "" ? null : Number(v) })
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
            item={cm.vehiclesChecklist?.[row.key]}
            disabled={readOnly}
            onChange={(next) =>
              update({
                vehiclesChecklist: { ...cm.vehiclesChecklist, [row.key]: next },
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
              item={cm.others?.keys?.[key]}
              disabled={readOnly}
              onChange={(next) =>
                update({
                  others: {
                    ...cm.others,
                    keys: { ...cm.others?.keys, [key]: next },
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
              item={cm.others?.speedometer?.[key]}
              disabled={readOnly}
              onChange={(next) =>
                update({
                  others: {
                    ...cm.others,
                    speedometer: { ...cm.others?.speedometer, [key]: next },
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
              item={cm.others?.steeringWheel?.[key]}
              disabled={readOnly}
              onChange={(next) =>
                update({
                  others: {
                    ...cm.others,
                    steeringWheel: { ...cm.others?.steeringWheel, [key]: next },
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
              item={cm.others?.tires?.[key]}
              disabled={readOnly}
              onChange={(next) =>
                update({
                  others: {
                    ...cm.others,
                    tires: { ...cm.others?.tires, [key]: next },
                  },
                })
              }
            />
          ))}
          <div className="grid gap-2 pt-2 sm:grid-cols-2">
            <TextField
              label="Thread of tires %"
              type="number"
              value={cm.others?.tires?.threadOfTiresPercent}
              disabled={readOnly}
              onChange={(v) =>
                update({
                  others: {
                    ...cm.others,
                    tires: {
                      ...cm.others?.tires,
                      threadOfTiresPercent: v === "" ? null : Number(v),
                    },
                  },
                })
              }
            />
            <TextField
              label="Remarks"
              value={cm.others?.tires?.remarks}
              disabled={readOnly}
              onChange={(v) =>
                update({
                  others: {
                    ...cm.others,
                    tires: { ...cm.others?.tires, remarks: v },
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
            item={cm.vehiclesCondition?.[row.key]}
            disabled={readOnly}
            onChange={(next) =>
              update({
                vehiclesCondition: { ...cm.vehiclesCondition, [row.key]: next },
              })
            }
          />
        ))}
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
