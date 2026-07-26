"use client";

import { useState } from "react";

import {
  Button,
  EmptyState,
  Input,
  Label,
  SegmentedControl,
  Table,
  Td,
  Th,
} from "@/components/ui";
import type { FieldAccess } from "@/lib/permissions/types";

const ACCESS_OPTIONS: Array<{ value: FieldAccess; label: string }> = [
  { value: "edit", label: "Edit" },
  { value: "read_only", label: "Read only" },
  { value: "deny", label: "Deny" },
];

type FieldRulesEditorProps = {
  rules: Record<string, FieldAccess>;
  onChange: (rules: Record<string, FieldAccess>) => void;
  disabled?: boolean;
};

export function FieldRulesEditor({
  rules,
  onChange,
  disabled = false,
}: FieldRulesEditorProps) {
  const [newField, setNewField] = useState("");
  const fields = Object.keys(rules).sort();

  function updateField(field: string, access: FieldAccess) {
    onChange({ ...rules, [field]: access });
  }

  function removeField(field: string) {
    const next = { ...rules };
    delete next[field];
    onChange(next);
  }

  function addField() {
    const key = newField.trim();
    if (!key || rules[key]) return;
    onChange({ ...rules, [key]: "edit" });
    setNewField("");
  }

  return (
    <div className="space-y-4">
      {fields.length === 0 ? (
        <EmptyState
          title="No field rules"
          description="Add a field key below to configure access."
          showMark={false}
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Field</Th>
              <Th>Access</Th>
              <Th> </Th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => (
              <tr key={field}>
                <Td>
                  <code className="id text-ink-900">{field}</code>
                </Td>
                <Td>
                  <SegmentedControl
                    value={rules[field]}
                    options={ACCESS_OPTIONS}
                    onChange={(access) => updateField(field, access)}
                    disabled={disabled}
                  />
                </Td>
                <Td>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    onClick={() => removeField(field)}
                    aria-label={`Remove ${field}`}
                  >
                    ✕
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <div>
        <Label htmlFor="new-field-key">Add field</Label>
        <div className="mt-1 flex gap-2">
          <Input
            id="new-field-key"
            value={newField}
            onChange={(e) => setNewField(e.target.value)}
            placeholder="e.g. computation"
            disabled={disabled}
            className="mono"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addField();
              }
            }}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={addField}
            disabled={disabled || !newField.trim()}
          >
            Add
          </Button>
        </div>
        <p className="mt-2 text-xs text-ink-400">
          Common keys: computation, borrower_info, verification_notes
        </p>
      </div>
    </div>
  );
}
