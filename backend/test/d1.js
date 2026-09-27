import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

// Executes production SQL against SQLite instead of imitating SQL with string matching.
export function createD1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  function statement(sql, args = []) {
    return {
      bind(...values) { return statement(sql, values); },
      async first() { return sqlite.prepare(sql).get(...args) || null; },
      async all() { return { results: sqlite.prepare(sql).all(...args) }; },
      execute() {
        const prepared = sqlite.prepare(sql);
        if (prepared.columns().length) return { success: true, results: prepared.all(...args), meta: { changes: 0 } };
        const result = prepared.run(...args); return { success: true, results: [], meta: { changes: result.changes } };
      },
      async run() { return this.execute(); },
    };
  }
  return {
    sqlite, prepare: statement,
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { const results = statements.map(s => s.execute()); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
}
