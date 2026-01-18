import {db} from "../db.js";

interface SearchResult {
	title: string;
	url: string;
	score: number;
	snippet: string;
}

export class FTSSearchService {
	/**
	 * Search the documentation using FTS5.
	 * @param query The search query string
	 * @param limit Max results
	 */
	search(query: string,limit: number=10): SearchResult[] {
		console.log(`[FTS] Searching for: ${query}, limit: ${limit}`);

		try {
			const stmt=db.prepare(`
                SELECT 
                    d.title, 
                    d.url, 
                    s.rank as score,
                    snippet(search_index, 2, '<b>', '</b>', '...', 30) as snippet
                FROM search_index s
                JOIN documents d ON d.url = s.url
                WHERE search_index MATCH @query
                ORDER BY score
                LIMIT @limit
            `);

			// Sanitize query for FTS5
			const cleanQuery=query.replace(/[^\w\s]/gi,'');
			const ftsQuery=`"${cleanQuery}"*`;

			const results=stmt.all({
				query: ftsQuery,
				limit
			}) as any[];

			console.log(`[FTS] Found ${results.length} results`);

			return results.map(r => ({
				title: r.title,
				url: r.url,
				score: r.score,
				snippet: r.snippet
			}));

		} catch (error) {
			console.error('[FTS] Search failed:',error);
			return [];
		}
	}
}
