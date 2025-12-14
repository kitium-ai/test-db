export type SqlParameters = unknown[];

export type SqlStatement = {
  sql: string;
  values: SqlParameters;
};

export type WhereClause = {
  clause: string;
  values: SqlParameters;
};

export function buildWhereClause(
  where: Record<string, unknown> | undefined,
  startIndex = 1
): WhereClause {
  if (!where || Object.keys(where).length === 0) {
    return { clause: '', values: [] };
  }

  const values: unknown[] = [];
  const conditions = Object.keys(where)
    .map((key, index) => {
      values.push(where[key]);
      return `${key} = $${startIndex + index}`;
    })
    .join(' AND ');

  return { clause: ` WHERE ${conditions}`, values };
}

export function buildInsertStatement(
  tableName: string,
  row: Record<string, unknown>
): SqlStatement {
  const columns = Object.keys(row);
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
  const values = columns.map((col) => row[col]);

  return {
    sql: `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`,
    values,
  };
}

export function buildUpdateStatement(
  tableName: string,
  updates: Record<string, unknown>,
  where: Record<string, unknown>
): SqlStatement {
  const updateKeys = Object.keys(updates);
  const updateColumns = updateKeys.map((key, index) => `${key} = $${index + 1}`).join(', ');

  const whereStartIndex = updateKeys.length + 1;
  const { clause: whereClause, values: whereValues } = buildWhereClause(where, whereStartIndex);

  return {
    sql: `UPDATE ${tableName} SET ${updateColumns}${whereClause}`,
    values: [...Object.values(updates), ...whereValues],
  };
}

export function buildDeleteStatement(
  tableName: string,
  where: Record<string, unknown>
): SqlStatement {
  const { clause: whereClause, values } = buildWhereClause(where, 1);
  return { sql: `DELETE FROM ${tableName}${whereClause}`, values };
}
