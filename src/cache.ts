import {LRUCache} from 'lru-cache';
import {env} from './config/env.js';
import {Section,extractContent} from './query/extract.js';

export interface CachedPage {
	url: string;
	title: string;
	sourceName: string;
	markdown: string;
	sections: Section[];
	cachedAt: number;
}

const pageCache=new LRUCache<string,CachedPage>({
	max: env.CACHE_SIZE,
	ttl: 1000*60*60,
	allowStale: true,
	updateAgeOnGet: true,
	sizeCalculation: (value) => {
		return Math.ceil((value.markdown.length+JSON.stringify(value.sections).length)/1024);
	},
	maxSize: 100*1024
});

export function getCachedPage(url: string): CachedPage|null {
	return pageCache.get(url)??null;
}

export function cachePage(page: CachedPage): void {
	pageCache.set(page.url,{...page,cachedAt: Date.now()});
}

export function invalidateSource(sourceName: string): number {
	let count=0;
	for (const [url,page] of pageCache.entries()) {
		if (page.sourceName===sourceName) {
			pageCache.delete(url);
			count++;
		}
	}
	return count;
}

export function getCacheStats() {
	return {
		size: pageCache.calculatedSize??0,
		maxSize: pageCache.maxSize,
		itemCount: pageCache.size,
		maxItems: pageCache.max
	};
}

export async function loadPage(url: string,sourceName: string): Promise<CachedPage|null> {
	const cached=getCachedPage(url);
	if (cached) return cached;

	try {
		const response=await fetch(url);
		if (!response.ok) return null;
		const rawHtml=await response.text();
		const parsed=extractContent(rawHtml);
		const page: CachedPage={
			url,
			title: parsed.title,
			sourceName,
			markdown: parsed.markdown,
			sections: parsed.sections,
			cachedAt: Date.now()
		};
		cachePage(page);
		return page;
	} catch (error) {
		console.error(`Failed to fetch page ${url}:`,error);
		return null;
	}
}
