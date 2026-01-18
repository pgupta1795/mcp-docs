import {logger} from '@/config/logger.js';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import {SeedUrl,env} from '../../../config/env.js';
import {db,initDb} from '../services/db.js';
import {FTSIndexer} from '../services/fts/indexer.js';
import {SemanticIndexer} from '../services/semantic/indexer.js';
import {CrawledPage,crawlSite} from './crawl.js';

export type IndexResult={
	sourceName: string;
	status: 'skipped'|'crawled'|'error';
	pagesProcessed?: number;
	errors?: number;
	message?: string;
}

function needsCrawl(seed: SeedUrl): boolean {
	const result=db.prepare("SELECT MAX(lastModified) as lastCrawled FROM documents WHERE sourceName = ?").get(seed.name) as {lastCrawled: number|null};
	const lastCrawled=result?.lastCrawled;
	if (!lastCrawled) return true;
	if (seed.recrawlIntervalHours===0) return false;
	const hoursSinceLastCrawl=(Date.now()-lastCrawled)/(1000*60*60);
	return hoursSinceLastCrawl>=seed.recrawlIntervalHours;
}

export async function runIndexer(options: {force?: boolean}={}): Promise<IndexResult[]> {
	const {force=false}=options;
	logger.info('Starting indexer...');
	initDb();

	// Initialize indexers
	const ftsIndexer=new FTSIndexer();
	const semanticIndexer=new SemanticIndexer();

	const results: IndexResult[]=[];

	for (const seed of env.seedUrls) {
		logger.info(`\nProcessing ${seed.name}...`);
		const shouldIndex=force||needsCrawl(seed);

		if (!shouldIndex) {
			// Check existing count (using simple count from documents table)
			const count=db.prepare("SELECT COUNT(*) as count FROM documents WHERE sourceName = ?").get(seed.name) as {count: number};
			logger.info(`Skipping ${seed.name} - already indexed (${count.count} pages)`);
			results.push({
				sourceName: seed.name,
				status: 'skipped',
				message: `Already indexed with ${count.count} pages`
			});
			continue;
		}

		// Clear existing data for this source
		logger.info(`Re-indexing ${seed.name} - clearing old data`);
		db.prepare("DELETE FROM documents WHERE sourceName = ?").run(seed.name);

		try {
			const crawlResult=await crawlSite(
				seed,
				async (page: CrawledPage) => {
					const id=crypto.createHash("md5").update(page.url).digest("hex");

					// 1. Update Documents Registry (metadata only)
					db.prepare(`
                        INSERT OR REPLACE INTO documents (id, url, sourceName, title, lastModified)
                        VALUES (?, ?, ?, ?, ?)
                    `).run(id,page.url,page.sourceName,page.title,Date.now());

					// 2. Extract Data for FTS
					const $=cheerio.load(page.html);
					const headings: string[]=[];
					$("h1, h2, h3").each((_,el) => {
						const t=$(el).text().trim();
						if (t) headings.push(t);
					});

					// Sparse content calculation (simplified from Enovia logic)
					let sparseContent=headings.join(" . ");
					const metaDesc=$('meta[name="description"]').attr("content");
					if (metaDesc) sparseContent+=" "+metaDesc;
					$("b, strong").each((_,el) => {sparseContent+=" "+$(el).text().trim();});

					// 3. FTS Indexing
					ftsIndexer.indexPage({
						url: page.url,
						title: page.title,
						headings: headings.join(" . "),
						content: sparseContent
					});

					// 4. Semantic Indexing
					await semanticIndexer.indexPage(page.url,page.html,page.title);
				},
				{maxPages: env.CRAWL_MAX_PAGES}
			);

			logger.info(`Completed ${seed.name}: ${crawlResult.pagesProcessed} pages`);
			results.push({
				sourceName: seed.name,
				status: 'crawled',
				pagesProcessed: crawlResult.pagesProcessed,
				errors: crawlResult.errors
			});
		} catch (error) {
			const message=error instanceof Error? error.message:String(error);
			logger.error(`Error indexing ${seed.name}: ${message}`);
			results.push({sourceName: seed.name,status: 'error',message});
		}
	}

	logger.info(`\nIndexer complete.`);
	return results;
}
