import {logger} from '@/config/logger';
import * as cheerio from "cheerio";
import {LRUCache} from "lru-cache";
import TurndownService from "turndown";

const contentCache=new LRUCache<string,string>({
	max: 100,
	ttl: 1000*60*60, // 1 hour
});

const turndownService=new TurndownService({
	headingStyle: 'atx',
	codeBlockStyle: 'fenced'
});

turndownService.remove(['script','style','nav','footer','iframe','noscript']);

export class ContentService {

	/**
	 * Fetches HTML from a URL and converts to Markdown.
	 * Uses caching to avoid re-fetching.
	 * @param url URL to fetch
	 * @param selector Optional CSS selector to extract a specific section
	 */
	async getDocContent(url: string,selector?: string): Promise<string> {
		logger.info(`[ContentService] Fetching: ${url}${selector? `, selector: ${selector}`:''}`);
		const cacheKey=`${url}:${selector||"FULL"}`;

		if (contentCache.has(cacheKey)) {
			logger.info(`[ContentService] Cache HIT: ${url}`);
			return contentCache.get(cacheKey)!;
		}

		logger.info(`[ContentService] Cache MISS: Fetching from URL...`);

		try {
			const response=await fetch(url);
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const html=await response.text();
			logger.info(`[ContentService] Fetched ${html.length} bytes from ${url}`);

			const $=cheerio.load(html);

			// Clean up the DOM before conversion
			$("nav").remove();
			$("header").remove();
			$("aside").remove();
			$("img").remove();
			$("video").remove();
			$("audio").remove();
			$("canvas").remove();
			$("svg").remove();
			$(".sidebar").remove();
			$(".breadcrumbs").remove();
			$(".nav-sidebar").remove();
			$(".toc").remove();

			let htmlToConvert="";

			if (selector) {
				const selected=$(selector);
				if (selected.length>0) {
					logger.info(`[ContentService] Selector matched ${selected.length} elements`);
					const parent=selected.parent();
					htmlToConvert=parent.length>0? $.html(parent):$.html(selected);
				} else {
					logger.info(`[ContentService] Selector not found, falling back to main content`);
					htmlToConvert=this.getMainContent($);
				}
			} else {
				htmlToConvert=this.getMainContent($);
			}

			const markdown=turndownService.turndown(htmlToConvert);
			logger.info(`[ContentService] Converted to ${markdown.length} chars of markdown`);

			contentCache.set(cacheKey,markdown);
			return markdown;

		} catch (error) {
			logger.error(`[ContentService] Error fetching ${url}:`+error);
			throw new Error(`Failed to fetch document: ${url}`);
		}
	}

	private getMainContent($: cheerio.CheerioAPI): string {
		const potentials=["article","main",".content","#main-content",".page-content","body"];

		for (const sel of potentials) {
			if ($(sel).length>0) {
				logger.info(`[ContentService] Found main content using: ${sel}`);
				return $.html($(sel));
			}
		}
		return $.html();
	}
}
