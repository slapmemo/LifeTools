import type { Executor } from '../../db/migrations';
import type { Chunk } from './tracker';
export interface SiteTotal { domain: string; seconds: number }
export function createTimeTrackerRepo(ex: Executor) { return {
  async addChunks(chunks: Chunk[]): Promise<void> { for (const c of chunks) await ex.exec('INSERT INTO site_time (day,domain,seconds) VALUES (?,?,?) ON CONFLICT(day,domain) DO UPDATE SET seconds=seconds+excluded.seconds', [c.day,c.domain,c.seconds]); },
  getDay(day: string): Promise<SiteTotal[]> { return ex.query('SELECT domain, seconds FROM site_time WHERE day=? ORDER BY seconds DESC, domain ASC', [day]); },
  getRange(fromDay: string, toDay: string): Promise<SiteTotal[]> { return ex.query('SELECT domain, SUM(seconds) AS seconds FROM site_time WHERE day>=? AND day<=? GROUP BY domain ORDER BY seconds DESC, domain ASC', [fromDay,toDay]); },
  async deleteAll(): Promise<void> { await ex.exec('DELETE FROM site_time'); },
  async deleteDomain(domain: string): Promise<void> { await ex.exec('DELETE FROM site_time WHERE domain=?', [domain]); }
}; }
