type FieldMap = Record<string, unknown>

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false
  const aKeys = Object.keys(a as object)
  const bKeys = Object.keys(b as object)
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every((k) => deepEqual((a as FieldMap)[k], (b as FieldMap)[k]))
}

// Only fields the YAML entry actually sets are compared — an omitted optional field (e.g. no
// `enabled:` in the YAML) must never be treated as "changed" just because the API fills in a
// default for it, or every `apply` would emit a spurious no-op PATCH.
function definedFields(entry: FieldMap): FieldMap {
  const result: FieldMap = {}
  for (const [key, value] of Object.entries(entry)) {
    if (value !== undefined) result[key] = value
  }
  return result
}

function computeChanges(desired: FieldMap, actual: FieldMap): FieldMap {
  const changes: FieldMap = {}
  for (const [key, value] of Object.entries(definedFields(desired))) {
    if (!deepEqual(actual[key], value)) changes[key] = value
  }
  return changes
}

export interface DiffResult<Desired> {
  create: Desired[]
  update: { id: number; name: string; changes: Record<string, unknown> }[]
  delete: { id: number; name: string }[]
  unchanged: string[]
}

/** Diffs desired YAML entries against actual API resources, matched by `name`. */
export function diffByName<
  Desired extends { name: string },
  Actual extends { id: number; name: string },
>(desired: Desired[], actual: Actual[]): DiffResult<Desired> {
  const actualByName = new Map(actual.map((entry) => [entry.name, entry]))
  const desiredNames = new Set(desired.map((entry) => entry.name))

  const create: Desired[] = []
  const update: DiffResult<Desired>['update'] = []
  const unchanged: string[] = []

  for (const entry of desired) {
    const existing = actualByName.get(entry.name)
    if (!existing) {
      create.push(entry)
      continue
    }
    const changes = computeChanges(entry as unknown as FieldMap, existing as unknown as FieldMap)
    if (Object.keys(changes).length > 0) {
      update.push({ id: existing.id, name: entry.name, changes })
    } else {
      unchanged.push(entry.name)
    }
  }

  const del = actual
    .filter((entry) => !desiredNames.has(entry.name))
    .map((entry) => ({ id: entry.id, name: entry.name }))

  return { create, update, delete: del, unchanged }
}
