// js/status.js
// Pure status computation — no DOM/clock deps, so it is unit-testable.
// Inputs use plain strings: seasonal windows are "MM-DD"; ad-hoc dates are "YYYY-MM-DD".
// Zero-padded fixed-width date strings compare correctly with < and >.
export const STATUSES = ["open", "closed", "partial"];

// seasonal: { from:"MM-DD", to:"MM-DD", partial?:bool } | null ; todayMMDD: "MM-DD"
export function seasonalActive(seasonal, todayMMDD) {
  if (!seasonal || !seasonal.from || !seasonal.to) return false;
  const { from, to } = seasonal;
  return from <= to
    ? todayMMDD >= from && todayMMDD <= to
    : todayMMDD >= from || todayMMDD <= to; // window wraps the year boundary
}

// closure: { from_date:"YYYY-MM-DD", to_date:"YYYY-MM-DD"|null } ; todayISO: "YYYY-MM-DD"
// A null OR missing to_date means the closure is ongoing (open-ended) — `== null` matches both.
export function adhocActive(closure, todayISO) {
  if (!closure || !closure.from_date) return false;
  if (todayISO < closure.from_date) return false;
  if (closure.to_date == null) return true; // ongoing
  return todayISO <= closure.to_date;
}

// seasonal as above | null ; adhocList: closure[] ; today: { mmdd, iso }
// Returns { status: "open"|"closed"|"partial", activeClosures: [...] }
export function computeStatus(seasonal, adhocList, today) {
  const activeClosures = [];
  let full = false;
  let partial = false;

  if (seasonalActive(seasonal, today.mmdd)) {
    activeClosures.push({ kind: "seasonal", partial: !!seasonal.partial, from: seasonal.from, to: seasonal.to,
      extent_from: seasonal.extent_from ?? null, extent_to: seasonal.extent_to ?? null });
    if (seasonal.partial) partial = true; else full = true;
  }
  for (const c of adhocList || []) {
    if (adhocActive(c, today.iso)) {
      activeClosures.push({ kind: "adhoc", ...c });
      if (c.partial) partial = true; else full = true;
    }
  }

  const status = full ? "closed" : partial ? "partial" : "open";
  return { status, activeClosures };
}
