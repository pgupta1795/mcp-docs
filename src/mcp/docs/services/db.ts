
import {logger} from '@/config/logger.js';
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import * as sqliteVec from "sqlite-vec";
import {env} from "../../../config/env.js";

const DB_PATH=env.DB_PATH;
const DB_DIR=path.dirname(DB_PATH);

if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR,{recursive: true});
}

logger.info(`Using database at: ${DB_PATH}`);

export const db: Database.Database=new Database(DB_PATH);

// Load sqlite-vec extension
sqliteVec.load(db);

export function initDb() {
    logger.info("=== Initializing Database Tables ===");

    // 1. Documents table (metadata only - content fetched at runtime)
    db.exec(`
        CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            url TEXT UNIQUE NOT NULL,
            sourceName TEXT NOT NULL,
            title TEXT,
            lastModified INTEGER,
            metadata JSON
        );
        CREATE INDEX IF NOT EXISTS idx_documents_source ON documents(sourceName);
    `);

    // 2. FTS5 Search Index
    const ftsExists=db.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='search_index'").get() as {count: number};
    if (ftsExists.count===0) {
        db.exec(`
            CREATE VIRTUAL TABLE search_index USING fts5(
                title, 
                headings, 
                content, 
                url UNINDEXED 
            );
        `);
    }

    // 3. Vector Chunks (vec0)
    const vecExists=db.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='vec_chunks'").get() as {count: number};
    if (vecExists.count===0) {
        db.exec(`
            CREATE VIRTUAL TABLE vec_chunks USING vec0(
                doc_id TEXT,
                chunk_embedding float[384] distance_metric=cosine,
                +chunk_text TEXT
            );
        `);
    }

    logger.info("=== Database initialization complete ===");
}
