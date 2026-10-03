import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';
import { realpathSync, statSync } from 'node:fs';
import { project } from './observations.ts';

function identity(path: string) {
  const stat = statSync(path);
  if (!stat.isFile()) throw Error('Not a journal file');
  return `${realpathSync(path)}:${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
}
/** Reads only the explicitly supplied projection journal, never a Store or Hermes file. */
export class Journal {
  private readonly db: DatabaseSync;
  private readonly identity: string;
  readonly epoch: string;
  private readonly path: string;
  constructor(path: string) {
    this.path = path;
    this.identity = identity(path);
    this.epoch = createHash('sha256').update(this.identity + ':' + randomBytes(32).toString('hex')).digest('hex');
    this.db = new DatabaseSync(path, { readOnly: true });
    try {
      const table = this.db.prepare("SELECT sql FROM sqlite_schema WHERE name='viewer_events' AND type='table'").get();
      if (!table || !/cursor\s+INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/i.test(String(table.sql))) throw Error('Invalid journal');
      this.read(0, 10000, true);
    } catch (error) { this.db.close(); throw error; }
  }
  read(after: number, limit: number, snapshot = false) {
    if (identity(this.path) !== this.identity) throw Error('Journal replaced');
    this.db.exec('BEGIN');
    try {
      const state = this.db.prepare('SELECT COUNT(*) count, COALESCE(MAX(cursor),0) cursor FROM viewer_events').get()!;
      if (Number(state.count) > 10000 || Number(state.cursor) < after) throw Error('Journal exceeds bounds or regressed');
      const rows = this.db.prepare('SELECT cursor,event_id,body FROM viewer_events WHERE cursor>? ORDER BY cursor LIMIT ?').all(after, limit);
      const observations = rows.map(row => project({ cursor: row.cursor, event_id: row.event_id, body: row.body }));
      this.db.exec('COMMIT');
      return { observations, cursor: snapshot ? Number(state.cursor) : observations.at(-1)?.cursor ?? after };
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close() { this.db.close(); }
}
