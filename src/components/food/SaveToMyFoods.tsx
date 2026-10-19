"use client";
import { useId, useState } from "react";
import { StarButton } from "./shared";

/** Small inline "name it and save" form used by the estimate card, manual entry and diary meals. */
export function SaveToMyFoods({ defaultName, label = "Save to My foods", hint, onSave, onCancel }: {
  defaultName: string;
  label?: string;
  hint?: string;
  onSave: (name: string, favorite: boolean) => Promise<void>;
  onCancel: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(defaultName.slice(0, 80));
  const [fav, setFav] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setErr("Give it a name."); document.getElementById(id)?.focus(); return; }
    setBusy(true); setErr(null);
    try { await onSave(name.trim(), fav); }
    catch { setErr("Could not save that. Try again."); setBusy(false); }
  }

  return (
    <form onSubmit={submit} noValidate className="grid min-w-0 gap-3 rounded-3xl border-2 border-ink bg-white p-4" aria-label={label}>
      {hint && <p className="text-sm text-ink2">{hint}</p>}
      <div className="flex min-w-0 items-end gap-2">
        <div className="min-w-0 flex-1">
          <label className="lbl" htmlFor={id}>Name</label>
          <input id={id} className="field" value={name} maxLength={80} autoFocus onChange={(e) => setName(e.target.value)}
            aria-invalid={err ? true : undefined} aria-describedby={err ? `${id}-e` : undefined} />
        </div>
        <StarButton on={fav} name={name || "this food"} onToggle={() => setFav((f) => !f)} className="mb-1.5" />
      </div>
      {err && <p id={`${id}-e`} role="alert" className="text-sm font-bold text-[#a3260b]">{err}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn" disabled={busy}>{busy ? "Saving…" : label}</button>
        <button type="button" className="btn secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
