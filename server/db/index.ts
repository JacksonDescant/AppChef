import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { resolve } from 'path'
import * as schema from './schema'

const DB_PATH = resolve(process.cwd(), 'appchef.db')
const sqlite = new Database(DB_PATH)

// Enable WAL mode for better concurrent read performance
sqlite.pragma('journal_mode = WAL')

export const db = drizzle(sqlite, { schema })

// Auto-create tables on startup (idempotent)
export function initDb() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      company TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      start_date TEXT NOT NULL DEFAULT '',
      end_date TEXT NOT NULL DEFAULT '',
      current INTEGER NOT NULL DEFAULT 0,
      description TEXT NOT NULL DEFAULT '',
      bullets TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS education (
      id TEXT PRIMARY KEY,
      institution TEXT NOT NULL DEFAULT '',
      degree TEXT NOT NULL DEFAULT '',
      field TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      start_date TEXT NOT NULL DEFAULT '',
      end_date TEXT NOT NULL DEFAULT '',
      current INTEGER NOT NULL DEFAULT 0,
      gpa TEXT NOT NULL DEFAULT '',
      minor TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      technologies TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      start_date TEXT NOT NULL DEFAULT '',
      end_date TEXT NOT NULL DEFAULT '',
      bullets TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      level TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS target_jobs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      industry TEXT NOT NULL DEFAULT '',
      location_type TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      min_salary INTEGER,
      max_salary INTEGER,
      notes TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      company TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      applied_at TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'applied',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS saved_resumes (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT '',
      job_description TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY DEFAULT 1,
      name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      website TEXT NOT NULL DEFAULT '',
      linkedin TEXT NOT NULL DEFAULT '',
      github TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      llama_endpoint TEXT NOT NULL DEFAULT 'http://localhost:8080',
      model_name TEXT NOT NULL DEFAULT '',
      temperature REAL NOT NULL DEFAULT 0.7,
      max_tokens INTEGER NOT NULL DEFAULT 32000
    );

    -- Seed singleton rows if not present
    INSERT OR IGNORE INTO profile (id) VALUES (1);
    INSERT OR IGNORE INTO settings (id) VALUES (1);
  `)

  // Additive migrations for existing DBs
  try { sqlite.exec(`ALTER TABLE education ADD COLUMN minor TEXT NOT NULL DEFAULT ''`) } catch {}
  try { sqlite.exec(`ALTER TABLE projects ADD COLUMN start_date TEXT NOT NULL DEFAULT ''`) } catch {}
  try { sqlite.exec(`ALTER TABLE projects ADD COLUMN end_date TEXT NOT NULL DEFAULT ''`) } catch {}
  try { sqlite.exec(`UPDATE settings SET max_tokens = 32000 WHERE id = 1 AND max_tokens = 2048`) } catch {}
}
