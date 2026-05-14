/**
 * The canonical `activity` table schema. Adapters and the migration
 * generator both consume this — the schema lives in *one place*.
 *
 * Field types are kept abstract (string / json / date / etc.) so each
 * adapter can map them to its dialect.
 */

export type FieldType =
  | "string"
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "json";

export interface FieldDef {
  name: string;
  type: FieldType;
  /** @default false */
  required?: boolean;
  /** Index this column. */
  indexed?: boolean;
  /** Make the column part of a multi-column index by group name. */
  indexGroup?: string;
  /** Mark as the table's primary key. */
  primary?: boolean;
  /** Mark as unique. */
  unique?: boolean;
  /** Human-readable description (emitted as a SQL COMMENT). */
  description?: string;
}

export interface ActivityTableSchema {
  /** Resolved table name. */
  name: string;
  /** Ordered list of fields. The first `primary: true` field is the PK. */
  fields: FieldDef[];
  /** Composite indexes derived from `indexGroup`. */
  indexes: Array<{ name: string; fields: string[] }>;
}

/**
 * Build the activity-table schema. Pure: takes only the desired table name.
 *
 * The shape is intentionally narrow:
 *
 *   id          TEXT primary key
 *   entity      TEXT not null              (indexed)
 *   entityId    TEXT not null              (indexed; composite with entity)
 *   action      TEXT not null
 *   actorId     TEXT nullable              (indexed)
 *   actorType   TEXT nullable
 *   metadata    JSON nullable
 *   ip          TEXT nullable
 *   userAgent   TEXT nullable
 *   requestId   TEXT nullable
 *   createdAt   TIMESTAMP not null         (indexed)
 */
export function getActivityTable(tableName = "activity"): ActivityTableSchema {
  const fields: FieldDef[] = [
    { name: "id", type: "string", required: true, primary: true },
    {
      name: "entity",
      type: "string",
      required: true,
      indexed: true,
      indexGroup: "entity_entity_id",
    },
    {
      name: "entityId",
      type: "string",
      required: true,
      indexGroup: "entity_entity_id",
    },
    { name: "action", type: "string", required: true, indexed: true },
    { name: "actorId", type: "string", required: false, indexed: true },
    { name: "actorType", type: "string", required: false },
    { name: "metadata", type: "json", required: false },
    { name: "ip", type: "string", required: false },
    { name: "userAgent", type: "text", required: false },
    { name: "requestId", type: "string", required: false },
    {
      name: "createdAt",
      type: "date",
      required: true,
      indexed: true,
    },
  ];

  const groups = new Map<string, string[]>();
  for (const f of fields) {
    if (f.indexGroup) {
      const list = groups.get(f.indexGroup) ?? [];
      list.push(f.name);
      groups.set(f.indexGroup, list);
    }
  }

  const indexes: ActivityTableSchema["indexes"] = [];
  for (const [name, fs] of groups.entries()) {
    if (fs.length > 1) {
      indexes.push({ name: `${tableName}_${name}_idx`, fields: fs });
    }
  }

  return { name: tableName, fields, indexes };
}
