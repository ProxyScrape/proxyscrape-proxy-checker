import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';

let db;

export function initDatabase() {
    const dbPath = path.join(app.getPath('userData'), 'proxy-checker.db');
    db = new Database(dbPath);

    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    db.exec(`
        CREATE TABLE IF NOT EXISTS checks (
            id TEXT PRIMARY KEY,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            total_checked INTEGER NOT NULL DEFAULT 0,
            working_count INTEGER NOT NULL DEFAULT 0,
            timeout_setting INTEGER NOT NULL DEFAULT 0,
            protocols TEXT NOT NULL DEFAULT '[]',
            avg_timeout INTEGER
        );

        CREATE TABLE IF NOT EXISTS check_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            check_id TEXT NOT NULL,
            host TEXT NOT NULL,
            port INTEGER NOT NULL,
            protocols TEXT NOT NULL DEFAULT '[]',
            anon TEXT,
            country_name TEXT,
            country_flag TEXT,
            timeout INTEGER,
            auth TEXT DEFAULT 'none',
            server TEXT,
            keep_alive INTEGER DEFAULT 0,
            blacklists TEXT DEFAULT '[]',
            FOREIGN KEY (check_id) REFERENCES checks(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_check_results_check_id ON check_results(check_id);
    `);

    return db;
}

export function saveCheck(checkData) {
    const { id, totalChecked, workingCount, timeoutSetting, protocols, avgTimeout, items, inBlacklists } = checkData;

    const insertCheck = db.prepare(`
        INSERT INTO checks (id, total_checked, working_count, timeout_setting, protocols, avg_timeout)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertResult = db.prepare(`
        INSERT INTO check_results (check_id, host, port, protocols, anon, country_name, country_flag, timeout, auth, server, keep_alive, blacklists)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction(() => {
        insertCheck.run(id, totalChecked, workingCount, timeoutSetting, JSON.stringify(protocols), avgTimeout || null);

        for (const item of items) {
            insertResult.run(
                id,
                item.host,
                item.port,
                JSON.stringify(item.protocols || []),
                item.anon || null,
                item.country ? item.country.name : null,
                item.country ? item.country.flag : null,
                item.timeout || null,
                item.auth || 'none',
                item.server || null,
                item.keepAlive ? 1 : 0,
                JSON.stringify(item.blacklists || inBlacklists || [])
            );
        }
    });

    transaction();
    return id;
}

export function getChecksList() {
    const rows = db.prepare(`
        SELECT
            c.id,
            c.created_at,
            c.total_checked,
            c.working_count,
            c.timeout_setting,
            c.protocols,
            c.avg_timeout,
            COUNT(DISTINCT cr.country_name) as country_count
        FROM checks c
        LEFT JOIN check_results cr ON cr.check_id = c.id
        GROUP BY c.id
        ORDER BY c.created_at DESC
    `).all();

    return rows.map(row => ({
        ...row,
        protocols: JSON.parse(row.protocols),
    }));
}

export function getCheckResults(checkId) {
    const check = db.prepare('SELECT * FROM checks WHERE id = ?').get(checkId);
    if (!check) return null;

    const results = db.prepare('SELECT * FROM check_results WHERE check_id = ? ORDER BY timeout ASC').all(checkId);

    const items = results.map(r => ({
        host: r.host,
        port: r.port,
        protocols: JSON.parse(r.protocols),
        anon: r.anon,
        country: r.country_name ? { name: r.country_name, flag: r.country_flag } : null,
        timeout: r.timeout,
        auth: r.auth || 'none',
        server: r.server,
        keepAlive: r.keep_alive === 1,
        blacklists: JSON.parse(r.blacklists),
    }));

    return {
        id: check.id,
        createdAt: check.created_at,
        totalChecked: check.total_checked,
        workingCount: check.working_count,
        timeoutSetting: check.timeout_setting,
        protocols: JSON.parse(check.protocols),
        avgTimeout: check.avg_timeout,
        items,
    };
}

export function deleteCheck(checkId) {
    db.prepare('DELETE FROM checks WHERE id = ?').run(checkId);
}

export function closeDatabase() {
    if (db) db.close();
}
