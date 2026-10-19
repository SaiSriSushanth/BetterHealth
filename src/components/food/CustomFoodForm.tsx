"use client";
import { useId, useState } from "react";
import { customFoodToInput, validateCustomFood, type CustomFoodErrors, type CustomFoodInput } from "@/lib/foods";
import type { CustomFood } from "@/lib/types";
import { StarButton } from "./shared";

type Saved = Omit<CustomFood, "id">;

const FIELDS: { k: keyof CustomFoodInput; l: string; hint?: string; mode?: "decimal" | "numeric" }[] = [
  { k: "portion", l: "Serving", hint: "e.g. 1 bar" },
  { k: "grams", l: "Grams", hint: "optional", mode: "numeric" },
  { k: "kcal", l: "Calories", mode: "numeric" },
  { k: "proteinG", l: "Protein g", mode: "decimal" },
  { k: "carbsG", l: "Carbs g", mode: "decimal" },
  { k: "fatG", l: "Fat g", mode: "decimal" },
  { k: "fiberG", l: "Fiber g", hint: "optional", mode: "decimal" },
  { k: "sugarG", l: "Sugar g", hint: "optional", mode: "decimal" },
];

/**
 * Create or edit a saved food. For a saved meal only name, serving and favourite are editable:
 * its numbers come from the foods inside it.
 */
export function CustomFoodForm({ initial, onSave, onCancel, title }: {
  initial?: CustomFood | null;
  onSave: (f: Saved) => Promise<void>;
  onCancel: () => void;
  title: string;
}) {
  const id = useId();
  const isMeal = initial?.kind === "meal";
  const [v, setV] = useState<CustomFoodInput>(() => customFoodToInput(initial));
  const [fav, setFav] = useState(initial?.favorite ?? false);
  const [errors, setErrors] = useState<CustomFoodErrors>({});
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = validateCustomFood(v);
    setErrors(r.errors);
    if (!r.value) {
      const first = Object.keys(r.errors)[0];
      if (first) document.getElementById(`${id}-${first}`)?.focus();
      return;
    }
    setBusy(true); setFail(null);
    try {
      if (isMeal && initial) {
        await onSave({ ...initial, name: r.value.name, portion: r.value.portion, favorite: fav });
      } else {
        await onSave({
          ...r.value,
          // keep the micronutrients we already knew when only macros were edited
          nutrients: initial ? { ...r.value.nutrients, ...keepMicros(initial) } : r.value.nutrients,
          favorite: fav, kind: "food",
        });
      }
    } catch {
      setFail("Could not save that. Try again.");
    }
    setBusy(false);
  }

  const shown = isMeal ? FIELDS.filter((f) => f.k === "portion") : FIELDS;

  return (
    <form onSubmit={submit} noValidate className="min-w-0 rounded-3xl border-2 border-ink bg-white p-4 sm:p-5" aria-labelledby={`${id}-t`}>
      <div className="flex items-start justify-between gap-3">
        <h3 id={`${id}-t`} className="text-2xl">{title}</h3>
        <StarButton on={fav} name={v.name || "this food"} onToggle={() => setFav((f) => !f)} />
      </div>
      {isMeal && <p className="mt-1 text-sm text-ink2">Calories and macros come from the {initial?.items?.length ?? 0} foods in this meal.</p>}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field id={`${id}-name`} label="Name" value={v.name} error={errors.name} className="col-span-2"
          onChange={(x) => setV({ ...v, name: x })} maxLength={80} />
        {shown.map((f) => (
          <Field key={f.k} id={`${id}-${f.k}`} label={f.l} hint={f.hint} value={v[f.k]} error={errors[f.k]} inputMode={f.mode}
            className={f.k === "portion" ? "col-span-2 sm:col-span-1" : ""} onChange={(x) => setV({ ...v, [f.k]: x })} maxLength={f.k === "portion" ? 40 : 8} />
        ))}
      </div>
      <p role="alert" className="mt-3 font-bold empty:hidden">{fail}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="submit" className="btn" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        <button type="button" className="btn secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

/** The form edits kcal, macros, fiber and sugar; sodium and the other micronutrients stay as saved. */
function keepMicros(initial: CustomFood) {
  const { sodiumMg, potassiumMg, calciumMg, ironMg, vitCMg } = initial.nutrients;
  return { sodiumMg, potassiumMg, calciumMg, ironMg, vitCMg };
}

function Field({ id, label, hint, value, error, onChange, inputMode, className = "", maxLength }: {
  id: string; label: string; hint?: string; value: string; error?: string; onChange: (v: string) => void;
  inputMode?: "decimal" | "numeric"; className?: string; maxLength?: number;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <label className="lbl" htmlFor={id}>{label}{hint && <span className="ml-1 font-semibold text-ink2">({hint})</span>}</label>
      <input id={id} className="field" value={value} inputMode={inputMode} maxLength={maxLength}
        aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : undefined}
        onChange={(e) => onChange(e.target.value)} />
      {error && <p id={`${id}-err`} className="mt-1 text-sm font-bold text-[#a3260b]">{error}</p>}
    </div>
  );
}
