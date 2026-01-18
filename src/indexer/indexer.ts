import {invalidateSource} from '../cache.js';
import {env} from '../config/env.js';
import {deleteSourcePages,getLastCrawledAt,getPageCount,getPageCountBySource,initDb,storePage} from '../db/db.js';
import {needsCrawl} from '../query/search.js';
import {CrawledPage,crawlSite} from './crawl.js';

export interface IndexResult {
	sourceName: string;
	status: 'skipped'|'crawled'|'error';
	pagesProcessed?: number;
	errors?: number;
	message?: string;
}

export async function runIndexer(options: {force?: boolean}={}): Promise<IndexResult[]> {
	const {force=false}=options;
	console.log('Starting indexer...');
	initDb();

	const results: IndexResult[]=[];

	for (const seed of env.seedUrls) {
		console.log(`\nProcessing ${seed.name}...`);
		const shouldIndex=force||needsCrawl(seed);

		if (!shouldIndex) {
			const pageCount=getPageCountBySource(seed.name);
			console.log(`Skipping ${seed.name} - already indexed (${pageCount} pages)`);
			results.push({
				sourceName: seed.name,
				status: 'skipped',
				message: `Already indexed with ${pageCount} pages`
			});
			continue;
		}

		const existingCount=getPageCountBySource(seed.name);
		if (existingCount>0) {
			console.log(`Re-indexing ${seed.name} - clearing ${existingCount} old pages`);
			deleteSourcePages(seed.name);
			invalidateSource(seed.name);
		}

		try {
			const crawlResult=await crawlSite(
				seed,
				async (page: CrawledPage) => {
					storePage(
						{url: page.url,sourceName: page.sourceName,title: page.title},
						{title: page.title,headings: page.headings,content: page.sparseContent,url: page.url}
					);
				},
				{maxPages: env.CRAWL_MAX_PAGES}
			);

			console.log(`Completed ${seed.name}: ${crawlResult.pagesProcessed} pages`);
			results.push({
				sourceName: seed.name,
				status: 'crawled',
				pagesProcessed: crawlResult.pagesProcessed,
				errors: crawlResult.errors
			});
		} catch (error) {
			const message=error instanceof Error? error.message:String(error);
			console.error(`Error indexing ${seed.name}: ${message}`);
			results.push({sourceName: seed.name,status: 'error',message});
		}
	}

	console.log(`\nIndexer complete: ${getPageCount()} total pages indexed`);
	return results;
}

export function getIndexerStatus() {
	const sources=env.seedUrls.map(seed => ({
		name: seed.name,
		pageCount: getPageCountBySource(seed.name),
		lastCrawled: getLastCrawledAt(seed.name),
		needsRecrawl: needsCrawl(seed)
	}));
	return {
		ready: getPageCount()>0&&!sources.some(s => s.needsRecrawl&&s.pageCount===0),
		totalPages: getPageCount(),
		sources
	};
}
