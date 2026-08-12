"use client";

import {
  Button,
  Input,
  Label,
  Select,
  Textarea,
} from "@/components/ui";
import {
  emptyInformants,
  RESIDENCE_TYPES,
  sumHouseExpenses,
  type FieldVisit,
  type NeighborhoodClass,
  type NeighborhoodQuality,
  type ResidenceTypeId,
} from "@/lib/cig/field-visit";

type Props = {
  value: FieldVisit | null;
  onChange: (next: FieldVisit) => void;
  onSave: (next: FieldVisit) => void;
  saving?: boolean;
  readOnly?: boolean;
};

function ensureVisit(value: FieldVisit | null): FieldVisit {
  return {
    header: value?.header ?? {},
    residence: {
      ...value?.residence,
      informants: value?.residence?.informants?.length
        ? value.residence.informants
        : emptyInformants(3),
    },
    business: {
      ...value?.business,
      informants: value?.business?.informants?.length
        ? value.business.informants
        : emptyInformants(3),
    },
    recommendation: value?.recommendation ?? {},
  };
}

function NeighborhoodSelects({
  label,
  classValue,
  qualityValue,
  disabled,
  onClass,
  onQuality,
}: {
  label: string;
  classValue?: NeighborhoodClass | null;
  qualityValue?: NeighborhoodQuality | null;
  disabled?: boolean;
  onClass: (v: NeighborhoodClass | null) => void;
  onQuality: (v: NeighborhoodQuality | null) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <p className="sm:col-span-3 text-xs font-medium text-ink-600">{label}</p>
      <div>
        <Label className="text-xs">Class</Label>
        <Select
          disabled={disabled}
          value={classValue ?? ""}
          onChange={(e) =>
            onClass((e.target.value || null) as NeighborhoodClass | null)
          }
        >
          <option value="">—</option>
          <option value="low">Low</option>
          <option value="middle">Middle</option>
          <option value="upper">Upper</option>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Quality</Label>
        <Select
          disabled={disabled}
          value={qualityValue ?? ""}
          onChange={(e) =>
            onQuality((e.target.value || null) as NeighborhoodQuality | null)
          }
        >
          <option value="">—</option>
          <option value="poor">Poor</option>
          <option value="fair">Fair</option>
          <option value="good">Good</option>
        </Select>
      </div>
    </div>
  );
}

export function FieldVisitForm({
  value,
  onChange,
  onSave,
  saving,
  readOnly,
}: Props) {
  const visit = ensureVisit(value);
  const houseTotal = sumHouseExpenses(visit.recommendation?.houseExpenses);

  function patch(next: FieldVisit) {
    onChange(next);
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h3 className="font-display text-base font-semibold text-navy-900">
          Header
        </h3>
        <p className="text-xs text-ink-400">
          Client / company address here is also used as “Address Provided” on
          the residence and business sheets.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Date requested</Label>
            <Input
              type="date"
              disabled={readOnly}
              value={visit.header?.dateRequested ?? ""}
              onChange={(e) =>
                patch({
                  ...visit,
                  header: { ...visit.header, dateRequested: e.target.value },
                })
              }
            />
          </div>
          <div>
            <Label required>Date visited</Label>
            <Input
              type="date"
              disabled={readOnly}
              value={visit.header?.dateVisited ?? ""}
              onChange={(e) =>
                patch({
                  ...visit,
                  header: { ...visit.header, dateVisited: e.target.value },
                })
              }
            />
          </div>
          <div>
            <Label>Requested by</Label>
            <Input
              disabled={readOnly}
              value={visit.header?.requestedBy ?? ""}
              onChange={(e) =>
                patch({
                  ...visit,
                  header: { ...visit.header, requestedBy: e.target.value },
                })
              }
            />
          </div>
          <div>
            <Label required>Visited by</Label>
            <Input
              disabled={readOnly}
              value={visit.header?.visitedBy ?? ""}
              onChange={(e) =>
                patch({
                  ...visit,
                  header: { ...visit.header, visitedBy: e.target.value },
                })
              }
            />
          </div>
          <div>
            <Label required>Client name</Label>
            <Input
              disabled={readOnly}
              value={visit.header?.clientName ?? ""}
              onChange={(e) =>
                patch({
                  ...visit,
                  header: { ...visit.header, clientName: e.target.value },
                })
              }
            />
          </div>
          <div>
            <Label>Company name</Label>
            <Input
              disabled={readOnly}
              value={visit.header?.companyName ?? ""}
              onChange={(e) =>
                patch({
                  ...visit,
                  header: { ...visit.header, companyName: e.target.value },
                })
              }
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Client address</Label>
            <Input
              disabled={readOnly}
              value={visit.header?.clientAddress ?? ""}
              onChange={(e) =>
                patch({
                  ...visit,
                  header: { ...visit.header, clientAddress: e.target.value },
                })
              }
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Company address</Label>
            <Input
              disabled={readOnly}
              value={visit.header?.companyAddress ?? ""}
              onChange={(e) =>
                patch({
                  ...visit,
                  header: { ...visit.header, companyAddress: e.target.value },
                })
              }
            />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-base font-semibold text-navy-900">
          I. Residence checking
        </h3>
        <div>
          <Label required>Type of residence</Label>
          <Select
            disabled={readOnly}
            value={visit.residence?.residenceType ?? ""}
            onChange={(e) =>
              patch({
                ...visit,
                residence: {
                  ...visit.residence,
                  residenceType: (e.target.value || null) as ResidenceTypeId | null,
                },
              })
            }
          >
            <option value="">Select</option>
            {RESIDENCE_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>Year of stay</Label>
            <Input
              type="number"
              disabled={readOnly}
              value={visit.residence?.yearOfStay ?? ""}
              onChange={(e) =>
                patch({
                  ...visit,
                  residence: {
                    ...visit.residence,
                    yearOfStay: e.target.value ? Number(e.target.value) : null,
                  },
                })
              }
            />
          </div>
          <div>
            <Label>Floor area (sqm)</Label>
            <Input
              type="number"
              disabled={readOnly}
              value={visit.residence?.floorAreaSqm ?? ""}
              onChange={(e) =>
                patch({
                  ...visit,
                  residence: {
                    ...visit.residence,
                    floorAreaSqm: e.target.value ? Number(e.target.value) : null,
                  },
                })
              }
            />
          </div>
          <div>
            <Label>Owned by</Label>
            <Input
              disabled={readOnly}
              value={visit.residence?.ownedBy ?? ""}
              onChange={(e) =>
                patch({
                  ...visit,
                  residence: { ...visit.residence, ownedBy: e.target.value },
                })
              }
            />
          </div>
        </div>
        <div className="space-y-3 rounded border border-line-100 p-3">
          <NeighborhoodSelects
            label="Neighborhood — Residential"
            classValue={visit.residence?.neighborhood?.residential?.class}
            qualityValue={visit.residence?.neighborhood?.residential?.quality}
            disabled={readOnly}
            onClass={(v) =>
              patch({
                ...visit,
                residence: {
                  ...visit.residence,
                  neighborhood: {
                    ...visit.residence?.neighborhood,
                    residential: {
                      ...visit.residence?.neighborhood?.residential,
                      class: v,
                    },
                  },
                },
              })
            }
            onQuality={(v) =>
              patch({
                ...visit,
                residence: {
                  ...visit.residence,
                  neighborhood: {
                    ...visit.residence?.neighborhood,
                    residential: {
                      ...visit.residence?.neighborhood?.residential,
                      quality: v,
                    },
                  },
                },
              })
            }
          />
          <NeighborhoodSelects
            label="Neighborhood — Commercial"
            classValue={visit.residence?.neighborhood?.commercial?.class}
            qualityValue={visit.residence?.neighborhood?.commercial?.quality}
            disabled={readOnly}
            onClass={(v) =>
              patch({
                ...visit,
                residence: {
                  ...visit.residence,
                  neighborhood: {
                    ...visit.residence?.neighborhood,
                    commercial: {
                      ...visit.residence?.neighborhood?.commercial,
                      class: v,
                    },
                  },
                },
              })
            }
            onQuality={(v) =>
              patch({
                ...visit,
                residence: {
                  ...visit.residence,
                  neighborhood: {
                    ...visit.residence?.neighborhood,
                    commercial: {
                      ...visit.residence?.neighborhood?.commercial,
                      quality: v,
                    },
                  },
                },
              })
            }
          />
          <NeighborhoodSelects
            label="Neighborhood — Mixed"
            classValue={visit.residence?.neighborhood?.mixed?.class}
            qualityValue={visit.residence?.neighborhood?.mixed?.quality}
            disabled={readOnly}
            onClass={(v) =>
              patch({
                ...visit,
                residence: {
                  ...visit.residence,
                  neighborhood: {
                    ...visit.residence?.neighborhood,
                    mixed: {
                      ...visit.residence?.neighborhood?.mixed,
                      class: v,
                    },
                  },
                },
              })
            }
            onQuality={(v) =>
              patch({
                ...visit,
                residence: {
                  ...visit.residence,
                  neighborhood: {
                    ...visit.residence?.neighborhood,
                    mixed: {
                      ...visit.residence?.neighborhood?.mixed,
                      quality: v,
                    },
                  },
                },
              })
            }
          />
        </div>
        <div>
          <Label>Findings report</Label>
          <Textarea
            disabled={readOnly}
            rows={3}
            value={visit.residence?.findingsReport ?? ""}
            onChange={(e) =>
              patch({
                ...visit,
                residence: {
                  ...visit.residence,
                  findingsReport: e.target.value,
                },
              })
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Informants (3)</Label>
          {(visit.residence?.informants ?? emptyInformants(3)).map((row, i) => (
            <div key={`res-inf-${i}`} className="grid gap-2 sm:grid-cols-2">
              <Input
                placeholder="Name"
                disabled={readOnly}
                value={row.name ?? ""}
                onChange={(e) => {
                  const informants = [
                    ...(visit.residence?.informants ?? emptyInformants(3)),
                  ];
                  informants[i] = { ...informants[i], name: e.target.value };
                  patch({
                    ...visit,
                    residence: { ...visit.residence, informants },
                  });
                }}
              />
              <Input
                placeholder="Address"
                disabled={readOnly}
                value={row.address ?? ""}
                onChange={(e) => {
                  const informants = [
                    ...(visit.residence?.informants ?? emptyInformants(3)),
                  ];
                  informants[i] = { ...informants[i], address: e.target.value };
                  patch({
                    ...visit,
                    residence: { ...visit.residence, informants },
                  });
                }}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-base font-semibold text-navy-900">
          II. Business checking
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Year of stay</Label>
            <Input
              type="number"
              disabled={readOnly}
              value={visit.business?.yearOfStay ?? ""}
              onChange={(e) =>
                patch({
                  ...visit,
                  business: {
                    ...visit.business,
                    yearOfStay: e.target.value ? Number(e.target.value) : null,
                  },
                })
              }
            />
          </div>
          <div>
            <Label>Floor area (sqm)</Label>
            <Input
              type="number"
              disabled={readOnly}
              value={visit.business?.floorAreaSqm ?? ""}
              onChange={(e) =>
                patch({
                  ...visit,
                  business: {
                    ...visit.business,
                    floorAreaSqm: e.target.value ? Number(e.target.value) : null,
                  },
                })
              }
            />
          </div>
        </div>
        <div>
          <Label>Findings report</Label>
          <Textarea
            disabled={readOnly}
            rows={2}
            value={visit.business?.findingsReport ?? ""}
            onChange={(e) =>
              patch({
                ...visit,
                business: {
                  ...visit.business,
                  findingsReport: e.target.value,
                },
              })
            }
          />
        </div>
        <div className="space-y-3 rounded border border-line-100 p-3">
          <p className="text-xs font-medium text-ink-600">
            Neighborhood — main site
          </p>
          <NeighborhoodSelects
            label="Residential"
            classValue={visit.business?.neighborhood?.residential?.class}
            qualityValue={visit.business?.neighborhood?.residential?.quality}
            disabled={readOnly}
            onClass={(v) =>
              patch({
                ...visit,
                business: {
                  ...visit.business,
                  neighborhood: {
                    ...visit.business?.neighborhood,
                    residential: {
                      ...visit.business?.neighborhood?.residential,
                      class: v,
                    },
                  },
                },
              })
            }
            onQuality={(v) =>
              patch({
                ...visit,
                business: {
                  ...visit.business,
                  neighborhood: {
                    ...visit.business?.neighborhood,
                    residential: {
                      ...visit.business?.neighborhood?.residential,
                      quality: v,
                    },
                  },
                },
              })
            }
          />
        </div>
        <div className="space-y-3 rounded border border-line-100 p-3">
          <p className="text-xs font-medium text-ink-600">
            Other offices (branch / warehouse) — independent neighborhood grid
          </p>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={readOnly}
                checked={Boolean(visit.business?.otherOffices?.branch)}
                onChange={(e) =>
                  patch({
                    ...visit,
                    business: {
                      ...visit.business,
                      otherOffices: {
                        ...visit.business?.otherOffices,
                        branch: e.target.checked,
                      },
                    },
                  })
                }
              />
              Branch
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={readOnly}
                checked={Boolean(visit.business?.otherOffices?.warehouse)}
                onChange={(e) =>
                  patch({
                    ...visit,
                    business: {
                      ...visit.business,
                      otherOffices: {
                        ...visit.business?.otherOffices,
                        warehouse: e.target.checked,
                      },
                    },
                  })
                }
              />
              Warehouse
            </label>
          </div>
          <Input
            placeholder="Address"
            disabled={readOnly}
            value={visit.business?.otherOffices?.address ?? ""}
            onChange={(e) =>
              patch({
                ...visit,
                business: {
                  ...visit.business,
                  otherOffices: {
                    ...visit.business?.otherOffices,
                    address: e.target.value,
                  },
                },
              })
            }
          />
          <NeighborhoodSelects
            label="Neighborhood — branch/warehouse"
            classValue={
              visit.business?.otherOffices?.neighborhood?.residential?.class
            }
            qualityValue={
              visit.business?.otherOffices?.neighborhood?.residential?.quality
            }
            disabled={readOnly}
            onClass={(v) =>
              patch({
                ...visit,
                business: {
                  ...visit.business,
                  otherOffices: {
                    ...visit.business?.otherOffices,
                    neighborhood: {
                      ...visit.business?.otherOffices?.neighborhood,
                      residential: {
                        ...visit.business?.otherOffices?.neighborhood
                          ?.residential,
                        class: v,
                      },
                    },
                  },
                },
              })
            }
            onQuality={(v) =>
              patch({
                ...visit,
                business: {
                  ...visit.business,
                  otherOffices: {
                    ...visit.business?.otherOffices,
                    neighborhood: {
                      ...visit.business?.otherOffices?.neighborhood,
                      residential: {
                        ...visit.business?.otherOffices?.neighborhood
                          ?.residential,
                        quality: v,
                      },
                    },
                  },
                },
              })
            }
          />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-base font-semibold text-navy-900">
          Recommendation
        </h3>
        <div>
          <Label>Evaluation summary</Label>
          <Textarea
            disabled={readOnly}
            rows={4}
            value={visit.recommendation?.evaluationSummary ?? ""}
            onChange={(e) =>
              patch({
                ...visit,
                recommendation: {
                  ...visit.recommendation,
                  evaluationSummary: e.target.value,
                },
              })
            }
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label required>Credit realization risk</Label>
            <Select
              disabled={readOnly}
              value={visit.recommendation?.creditRealizationRisk ?? ""}
              onChange={(e) =>
                patch({
                  ...visit,
                  recommendation: {
                    ...visit.recommendation,
                    creditRealizationRisk: (e.target.value || null) as
                      | "high"
                      | "medium"
                      | "low"
                      | null,
                  },
                })
              }
            >
              <option value="">Select</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </Select>
          </div>
          <div>
            <Label required>Recommendation</Label>
            <Select
              disabled={readOnly}
              value={visit.recommendation?.recommendation ?? ""}
              onChange={(e) =>
                patch({
                  ...visit,
                  recommendation: {
                    ...visit.recommendation,
                    recommendation: (e.target.value || null) as
                      | "for_approval"
                      | "for_disapproval"
                      | null,
                  },
                })
              }
            >
              <option value="">Select</option>
              <option value="for_approval">For approval</option>
              <option value="for_disapproval">For disapproval</option>
            </Select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["rental", "Rental"],
              ["salary", "Salary"],
              ["electricity", "Electricity"],
              ["school", "School"],
              ["water", "Water"],
              ["internet", "Internet"],
              ["foods", "Foods"],
              ["others", "Others"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <Label>{label}</Label>
              <Input
                type="number"
                step="0.01"
                disabled={readOnly}
                value={visit.recommendation?.houseExpenses?.[key] ?? ""}
                onChange={(e) =>
                  patch({
                    ...visit,
                    recommendation: {
                      ...visit.recommendation,
                      houseExpenses: {
                        ...visit.recommendation?.houseExpenses,
                        [key]: e.target.value ? Number(e.target.value) : null,
                      },
                    },
                  })
                }
              />
            </div>
          ))}
        </div>
        <p className="text-sm text-ink-600">
          House expenses total (computed):{" "}
          <span className="mono font-medium">₱{houseTotal.toFixed(2)}</span>
        </p>
        <p className="text-xs text-ink-400">
          Business income lines are typed fields only — no affordability formula
          enforced yet (same decision as Phase 3.5.4).
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label required>Prepared by</Label>
            <Input
              disabled={readOnly}
              value={visit.recommendation?.preparedBy ?? ""}
              onChange={(e) =>
                patch({
                  ...visit,
                  recommendation: {
                    ...visit.recommendation,
                    preparedBy: e.target.value,
                  },
                })
              }
            />
          </div>
          <div>
            <Label>Prepared date</Label>
            <Input
              type="date"
              disabled={readOnly}
              value={visit.recommendation?.preparedDate ?? ""}
              onChange={(e) =>
                patch({
                  ...visit,
                  recommendation: {
                    ...visit.recommendation,
                    preparedDate: e.target.value,
                  },
                })
              }
            />
          </div>
          <div>
            <Label>Reviewed by</Label>
            <Input
              disabled={readOnly}
              value={visit.recommendation?.reviewedBy ?? ""}
              onChange={(e) =>
                patch({
                  ...visit,
                  recommendation: {
                    ...visit.recommendation,
                    reviewedBy: e.target.value,
                  },
                })
              }
            />
          </div>
          <div>
            <Label>Review date</Label>
            <Input
              type="date"
              disabled={readOnly}
              value={visit.recommendation?.reviewedDate ?? ""}
              onChange={(e) =>
                patch({
                  ...visit,
                  recommendation: {
                    ...visit.recommendation,
                    reviewedDate: e.target.value,
                  },
                })
              }
            />
          </div>
        </div>
      </section>

      {!readOnly ? (
        <Button
          type="button"
          loading={saving}
          onClick={() => onSave(visit)}
        >
          Save field visit
        </Button>
      ) : null}
    </div>
  );
}
