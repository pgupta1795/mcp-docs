import {SeedUrl} from '../config/env.js';
import {getDb,getLastCrawledAt} from '../db/db.js';

export interface SearchResult {
	url: string;
	title: string;
	sourceName: string;
	snippet: string;
	rank: number;
}

export function search(query: string,limit: number=10): SearchResult[] {
	try {
		const database=getDb();
		const escapedQuery=escapeQuery(query);
		const stmt=database.prepare(`
			SELECT 
				p.url,
				p.title,
				p.source_name as sourceName,
				snippet(pages_fts, 2, '<mark>', '</mark>', '...', 64) as snippet,
				bm25(pages_fts) as rank
			FROM pages_fts
			JOIN pages p ON pages_fts.url = p.url
			WHERE pages_fts MATCH ?
			ORDER BY rank
			LIMIT ?
		`);
		return stmt.all(escapedQuery,limit) as SearchResult[];
	} catch (error) {
		console.error('Search error:',error);
		return [];
	}
}

export function searchInSource(query: string,sourceName: string,limit: number=10): SearchResult[] {
	try {
		const database=getDb();
		const escapedQuery=escapeQuery(query);
		const stmt=database.prepare(`
			SELECT 
				p.url,
				p.title,
				p.source_name as sourceName,
				snippet(pages_fts, 2, '<mark>', '</mark>', '...', 64) as snippet,
				bm25(pages_fts) as rank
			FROM pages_fts
			JOIN pages p ON pages_fts.url = p.url
			WHERE pages_fts MATCH ? AND p.source_name = ?
			ORDER BY rank
			LIMIT ?
		`);
		return stmt.all(escapedQuery,sourceName,limit) as SearchResult[];
	} catch (error) {
		console.error('Search error:',error);
		return [];
	}
}

export function needsCrawl(seed: SeedUrl): boolean {
	const lastCrawled=getLastCrawledAt(seed.name);
	if (!lastCrawled) return true;
	if (seed.recrawlIntervalHours===0) return false;
	const hoursSinceLastCrawl=(Date.now()-lastCrawled)/(1000*60*60);
	return hoursSinceLastCrawl>=seed.recrawlIntervalHours;
}

function escapeQuery(query: string): string {
	let escaped=query
		.replace(/[*^"():]/g,' ')
		.replace(/\s+/g,' ')
		.trim();
	const words=escaped.split(' ').filter(w => w.length>0);
	if (words.length===0) return '*';
	if (words.length===1) return `${words[0]}*`;
	return words.map(w => `${w}*`).join(' OR ');
}
