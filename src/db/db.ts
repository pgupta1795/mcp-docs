import Database from 'better-sqlite3';
import {existsSync,mkdirSync,readFileSync} from 'fs';
import {dirname,join} from 'path';
import {fileURLToPath} from 'url';
import {env} from '../config/env.js';

const __filename=fileURLToPath(import.meta.url);
const __dirname=dirname(__filename);

let db: Database.Database|null=null;

export interface PageData {
	url: string;
	sourceName: string;
	title: string;
}

export interface FtsData {
	title: string;
	headings: string;
	content: string;
	url: string;
}

export function initDb(): Database.Database {
	if (db) return db;
	const dbDir=dirname(env.DB_PATH);
	if (!existsSync(dbDir)) mkdirSync(dbDir,{recursive: true});
	db=new Database(env.DB_PATH);
	db.pragma('journal_mode = WAL');

	const schemaPath=join(__dirname,'schema.sql');
	const schema=readFileSync(schemaPath,'utf-8');
	db.exec(schema);
	console.log(`Database initialized at ${env.DB_PATH}`);
	return db;
}

export function getDb(): Database.Database {
	if (!db) return initDb();
	return db;
}

export function closeDb(): void {
	if (db) {
		db.close();
		db=null;
	}
}

export function storePage(page: PageData,fts: FtsData): void {
	const database=getDb();
	const insertPage=database.prepare(`
		INSERT OR REPLACE INTO pages (url, source_name, title, crawled_at)
		VALUES (?, ?, ?, ?)
	`);
	insertPage.run(page.url,page.sourceName,page.title,Date.now());

	const deleteFts=database.prepare(`DELETE FROM pages_fts WHERE url = ?`);
	deleteFts.run(fts.url);

	const insertFts=database.prepare(`
		INSERT INTO pages_fts (title, headings, content, url)
		VALUES (?, ?, ?, ?)
	`);
	insertFts.run(fts.title,fts.headings,fts.content,fts.url);
}

export function getPage(url: string): PageData|null {
	const database=getDb();
	const stmt=database.prepare(`
		SELECT url, source_name as sourceName, title
		FROM pages WHERE url = ?
	`);
	return stmt.get(url) as PageData|null;
}

export function getPageCount(): number {
	const database=getDb();
	const stmt=database.prepare(`SELECT COUNT(*) as count FROM pages`);
	const result=stmt.get() as {count: number};
	return result.count;
}

export function getPageCountBySource(sourceName: string): number {
	const database=getDb();
	const stmt=database.prepare(`SELECT COUNT(*) as count FROM pages WHERE source_name = ?`);
	const result=stmt.get(sourceName) as {count: number};
	return result.count;
}

export function getLastCrawledAt(sourceName: string): number|null {
	const database=getDb();
	const stmt=database.prepare(`SELECT MAX(crawled_at) as lastCrawled FROM pages WHERE source_name = ?`);
	const result=stmt.get(sourceName) as {lastCrawled: number|null};
	return result.lastCrawled;
}

export function deleteSourcePages(sourceName: string): void {
	const database=getDb();
	const getUrls=database.prepare(`SELECT url FROM pages WHERE source_name = ?`);
	const urls=getUrls.all(sourceName) as {url: string}[];

	const deletePage=database.prepare(`DELETE FROM pages WHERE source_name = ?`);
	deletePage.run(sourceName);

	const deleteFts=database.prepare(`DELETE FROM pages_fts WHERE url = ?`);
	for (const {url} of urls) {
		deleteFts.run(url);
	}
}
