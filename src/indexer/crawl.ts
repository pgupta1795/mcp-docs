import {CheerioCrawler,Configuration} from 'crawlee';
import {env,SeedUrl} from '../config/env.js';
import {extractHeadings,extractSparseContent} from '../query/extract.js';

export type CrawledPage={
	url: string;
	title: string;
	headings: string;
	sparseContent: string;
	sourceName: string;
}

export type PageCallback=(page: CrawledPage) => Promise<void>;

export async function crawlSite(
	seed: SeedUrl,
	onPage: PageCallback,
	options?: {maxPages?: number}
): Promise<{pagesProcessed: number; errors: number}> {
	const maxPages=options?.maxPages??env.CRAWL_MAX_PAGES;
	const navSelectors=getNavSelectors(seed.navigationMode);
	let pagesProcessed=0;
	let errors=0;
	const processedUrls=new Set<string>();

	const crawlConfig=new Configuration({
		storageClientOptions: {
			localDataDirectory: `./storage/${seed.name.replace(/[^a-zA-Z0-9]/g,'_')}`
		}
	});

	const crawler=new CheerioCrawler({
		async requestHandler({request,$,enqueueLinks,log}) {
			const loadedUrl=request.loadedUrl||request.url;
			const baseUrl=loadedUrl.split('#')[0];

			if (!shouldCrawl(baseUrl)||!isInSameSection(baseUrl,seed.url)) return;
			if (processedUrls.has(baseUrl)) return;
			processedUrls.add(baseUrl);

			try {
				const title=$('title').text().trim()||$('h1').first().text().trim()||'Untitled';
				const rawHtml=$.html();
				const headings=extractHeadings(rawHtml);
				const sparseContent=extractSparseContent(rawHtml);

				await onPage({
					url: baseUrl,
					title,
					headings: headings.join(' . '),
					sparseContent,
					sourceName: seed.name
				});
				pagesProcessed++;
				log.info(`Processed page ${pagesProcessed}: ${title}`);

				const anchorLinks=extractAnchorLinks($,baseUrl,navSelectors);
				for (const anchor of anchorLinks) {
					if (processedUrls.has(anchor.url)) continue;
					processedUrls.add(anchor.url);

					const sectionContent=extractSectionContent($,anchor.anchor);
					await onPage({
						url: anchor.url,
						title: anchor.title,
						headings: anchor.title,
						sparseContent: sectionContent||anchor.title,
						sourceName: seed.name
					});
					pagesProcessed++;
				}
				if (anchorLinks.length>0) {
					log.info(`Indexed ${anchorLinks.length} anchor sections from ${title}`);
				}
			} catch (error) {
				errors++;
				log.error(`Error processing ${baseUrl}: ${error}`);
			}

			await enqueueLinks({
				selector: navSelectors,
				strategy: 'same-domain',
				transformRequestFunction: (req) => {
					const normalized=normalizeUrl(req.url,loadedUrl);
					if (normalized&&shouldCrawl(normalized)&&isInSameSection(normalized,seed.url)) {
						req.url=normalized;
						return req;
					}
					return false;
				}
			});
		},

		failedRequestHandler({request,log}) {
			errors++;
			log.error(`Request failed: ${request.url}`);
		},

		maxRequestsPerCrawl: maxPages,
		maxConcurrency: 5,
		requestHandlerTimeoutSecs: 30,
		maxRequestRetries: 2,
	},crawlConfig);

	console.log(`Starting crawl of ${seed.name} from ${seed.url}`);
	await crawler.run([seed.url]);
	console.log(`Crawl complete: ${pagesProcessed} pages, ${errors} errors`);
	return {pagesProcessed,errors};
}

function getNavSelectors(mode: SeedUrl['navigationMode']): string {
	const anchorSelectors=[
		'#toc a',
		'.toc a',
		'.table-of-contents a',
		'[id*="toc"] a'
	];

	const sidebarSelectors=[
		'nav a',
		'aside a',
		'.sidebar a',
		'[role="navigation"] a',
		'.nav-sidebar a',
		'.docs-nav a',
		'.menu a',
		'#sidebar a'
	];

	const navbarSelectors=[
		'header a',
		'.navbar a',
		'.nav a',
		'.header-nav a',
		'.top-nav a',
		'[role="navigation"] a',
	];

	const anchors=anchorSelectors.join(', ');

	switch (mode) {
		case 'sidebar':
			return `${sidebarSelectors.join(', ')}, ${anchors}`;
		case 'navbar':
			return `${navbarSelectors.join(', ')}, ${anchors}`;
		case 'auto':
			return `${sidebarSelectors.join(', ')}, ${navbarSelectors.join(', ')}, ${anchors}`;
	}
}

function normalizeUrl(url: string,baseUrl?: string): string|null {
	try {
		const fullUrl=baseUrl? new URL(url,baseUrl):new URL(url);
		fullUrl.hash='';
		let normalized=fullUrl.toString();
		if (normalized.endsWith('/')&&fullUrl.pathname!=='/') {
			normalized=normalized.slice(0,-1);
		}
		return normalized;
	} catch {
		return null;
	}
}

function shouldCrawl(url: string): boolean {
	const path=new URL(url).pathname.toLowerCase();
	const skipPatterns=[
		/\.(jpg|jpeg|png|gif|svg|ico|webp)$/i,
		/\.(css|js|json|xml|txt|pdf)$/i,
		/\.(zip|tar|gz|rar)$/i,
		/\.(woff|woff2|ttf|eot)$/i,
		/\.(mp3|mp4|wav|avi)$/i,
		/^\/?_/,
		/\/api\//i,
	];
	return !skipPatterns.some(p => p.test(path));
}

function isInSameSection(url: string,baseUrl: string): boolean {
	try {
		const urlPath=new URL(url).pathname;
		const basePath=new URL(baseUrl).pathname;
		const baseSegments=basePath.split('/').filter(Boolean);
		const urlSegments=urlPath.split('/').filter(Boolean);
		const checkDepth=Math.min(3,baseSegments.length);
		for (let i=0;i<checkDepth;i++) {
			if (urlSegments[i]!==baseSegments[i]) return false;
		}
		return true;
	} catch {
		return false;
	}
}

type AnchorEntry={
	anchor: string;
	url: string;
	title: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractAnchorLinks($: any,pageUrl: string,navSelectors: string): AnchorEntry[] {
	const entries: AnchorEntry[]=[];
	const seenAnchors=new Set<string>();

	$(navSelectors).each((_: number,el: unknown) => {
		const href=$(el).attr('href');
		const title=$(el).text().trim();
		if (href?.startsWith('#')&&href.length>1&&title) {
			const anchor=href.slice(1);
			if (!seenAnchors.has(anchor)) {
				seenAnchors.add(anchor);
				entries.push({
					anchor,
					url: `${pageUrl}#${anchor}`,
					title
				});
			}
		}
	});

	return entries;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractSectionContent($: any,anchor: string): string {
	const escapedAnchor=anchor.replace(/[!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~]/g,'\\$&');
	const target=$(`#${escapedAnchor}, [name="${anchor}"]`).first();
	if (!target.length) return '';

	const parts: string[]=[];
	let current=target;
	const tagName=target.prop('tagName')?.toLowerCase();
	if (tagName&&/^h[1-6]$/.test(tagName)) {
		current=target.next();
	} else {
		current=target.parent().next();
	}

	let count=0;
	while (current.length&&count<10) {
		const currentTag=current.prop('tagName')?.toLowerCase();
		if (currentTag&&/^h[1-6]$/.test(currentTag)) break;
		const text=current.text().trim();
		if (text) parts.push(text);
		current=current.next();
		count++;
	}

	return parts.join(' ').slice(0,800);
}

