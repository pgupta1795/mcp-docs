import {config} from 'dotenv';
import {z} from 'zod';

config();

export type SeedUrl={
	name: string;
	url: string;
	navigationMode: 'sidebar'|'navbar'|'auto';
	/** Hours between re-crawls. 0 = never recrawl after initial index */
	recrawlIntervalHours: number;
}

/**
 * Input format: name1|url1|mode1|hours1,name2|url2|mode2|hours2,...
 */
function parseSeedUrls(seedUrls: string): SeedUrl[] {
	try {
		return seedUrls.split(',').map(entry => {
			const [name,url,mode,hours]=entry.split('|');
			return {
				name: name.trim(),
				url: url.trim(),
				navigationMode: (mode?.trim() as SeedUrl['navigationMode'])||'auto',
				recrawlIntervalHours: parseInt(hours?.trim()||'0',10)
			};
		});
	} catch {
		throw new Error('Failed to parse SEED_URLS from environment');
	}
}

const envSchema=z.object({
	NODE_ENV: z
		.enum(['development','production','test'])
		.default('development'),
	PORT: z.string().default('5004').transform(Number),
	LOG_LEVEL: z
		.enum(['verbose','trace','debug','info','warn','error','fatal'])
		.default('info'),
	SEED_URLS: z.string().min(1,'SEED_URLS is required'),
	CRAWL_MAX_DEPTH: z.string().default('5').transform(Number),
	CRAWL_MAX_PAGES: z.string().default('1000').transform(Number),
	INIT_ON_START: z.string().default('true').transform(val => val!=='false'),
	DB_PATH: z.string().default('./data/tvc-docs.db'),
	CACHE_SIZE: z.string().default('100').transform(Number)
});

const parsed=envSchema.parse({
	NODE_ENV: process.env.NODE_ENV,
	PORT: process.env.PORT,
	LOG_LEVEL: process.env.LOG_LEVEL,
	SEED_URLS: process.env.SEED_URLS,
	CRAWL_MAX_DEPTH: process.env.CRAWL_MAX_DEPTH,
	CRAWL_MAX_PAGES: process.env.CRAWL_MAX_PAGES,
	INIT_ON_START: process.env.INIT_ON_START,
	DB_PATH: process.env.DB_PATH,
	CACHE_SIZE: process.env.CACHE_SIZE
});

export const env={
	...parsed,
	seedUrls: parseSeedUrls(parsed.SEED_URLS)
};