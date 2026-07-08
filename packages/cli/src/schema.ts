import { Type, type Static } from '@sinclair/typebox'
import { Ajv, type ErrorObject } from 'ajv'

// Mirrors MonitorBody / AlertChannelBody in packages/server/src/routes/{monitors,alert-channels}.ts.
// The CLI validates client-side before calling the API, so it needs its own copy of these shapes;
// keep the two in sync by hand when the API schemas change. `name` is the reconciliation key the
// CLI diffs on (see src/diff.ts) — the server enforces it as unique for both resource types.
const MonitorType = Type.Union([
  Type.Literal('http'),
  Type.Literal('tcp'),
  Type.Literal('ping'),
  Type.Literal('keyword'),
])

export const MonitorEntry = Type.Object({
  name: Type.String({ minLength: 1 }),
  type: MonitorType,
  enabled: Type.Optional(Type.Boolean()),
  intervalSeconds: Type.Integer({ minimum: 10 }),
  timeoutMs: Type.Optional(Type.Integer({ minimum: 1 })),
  retries: Type.Optional(Type.Integer({ minimum: 0 })),
  degradedAfterMs: Type.Optional(Type.Integer({ minimum: 0 })),
  httpUrl: Type.Optional(Type.String()),
  httpMethod: Type.Optional(Type.String()),
  httpExpectedStatus: Type.Optional(Type.Integer()),
  httpBodyContains: Type.Optional(Type.String()),
  host: Type.Optional(Type.String()),
  port: Type.Optional(Type.Integer({ minimum: 1, maximum: 65535 })),
  // Names of alertChannels entries (either in this file or already on the server) to assign to
  // this monitor. Reconciled separately from the rest of MonitorEntry, after monitors and
  // alertChannels are both applied — see resolveAlertChannelAssignments in commands/apply.ts —
  // since it's a full-replace call against a junction table, not a patchable monitor field.
  alertChannels: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
})

const AlertChannelType = Type.Union([
  Type.Literal('slack'),
  Type.Literal('webhook'),
  Type.Literal('email'),
])

export const AlertChannelEntry = Type.Object({
  name: Type.String({ minLength: 1 }),
  type: AlertChannelType,
  config: Type.Record(Type.String(), Type.Unknown()),
  enabled: Type.Optional(Type.Boolean()),
})

export const ConfigDocument = Type.Object({
  monitors: Type.Optional(Type.Array(MonitorEntry)),
  alertChannels: Type.Optional(Type.Array(AlertChannelEntry)),
})

export type MonitorEntryT = Static<typeof MonitorEntry>
export type AlertChannelEntryT = Static<typeof AlertChannelEntry>
export type ConfigDocumentT = Static<typeof ConfigDocument>

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true })
const validateDocument = ajv.compile(ConfigDocument)

export class ConfigValidationError extends Error {
  constructor(
    public readonly file: string,
    public readonly errors: string[],
  ) {
    super(`invalid config in ${file}:\n${errors.map((e) => `  - ${e}`).join('\n')}`)
    this.name = 'ConfigValidationError'
  }
}

function assertUniqueNames(entries: { name: string }[], resource: string, file: string): void {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const entry of entries) {
    if (seen.has(entry.name)) duplicates.add(entry.name)
    seen.add(entry.name)
  }
  if (duplicates.size > 0) {
    throw new ConfigValidationError(
      file,
      [...duplicates].map((name) => `duplicate ${resource} name "${name}"`),
    )
  }
}

// Mirrors validateTypeRequirements in packages/server/src/routes/monitors.ts — checked here too so
// `apply` fails fast on a bad YAML file instead of partway through reconciling against the API.
function typeRequirementErrors(monitor: MonitorEntryT): string[] {
  const errors: string[] = []
  if ((monitor.type === 'http' || monitor.type === 'keyword') && !monitor.httpUrl) {
    errors.push(`monitor "${monitor.name}": httpUrl is required for type "${monitor.type}"`)
  }
  if (monitor.type === 'keyword' && !monitor.httpBodyContains) {
    errors.push(`monitor "${monitor.name}": httpBodyContains is required for type "keyword"`)
  }
  if ((monitor.type === 'tcp' || monitor.type === 'ping') && !monitor.host) {
    errors.push(`monitor "${monitor.name}": host is required for type "${monitor.type}"`)
  }
  if (monitor.type === 'tcp' && !monitor.port) {
    errors.push(`monitor "${monitor.name}": port is required for type "tcp"`)
  }
  return errors
}

export function parseConfigDocument(raw: unknown, file: string): ConfigDocumentT {
  if (!validateDocument(raw)) {
    const errors = (validateDocument.errors ?? []).map((e: ErrorObject) =>
      `${e.instancePath || '(root)'} ${e.message ?? ''}`.trim(),
    )
    throw new ConfigValidationError(file, errors)
  }

  const doc = raw as ConfigDocumentT
  assertUniqueNames(doc.monitors ?? [], 'monitor', file)
  assertUniqueNames(doc.alertChannels ?? [], 'alert channel', file)

  const typeErrors = (doc.monitors ?? []).flatMap(typeRequirementErrors)
  if (typeErrors.length > 0) throw new ConfigValidationError(file, typeErrors)

  return doc
}
