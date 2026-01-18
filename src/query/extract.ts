import * as cheerio from 'cheerio';
import TurndownService from 'turndown';

export type Section={
	heading: string[];
	content: string;
	anchor?: string;
	wordCount: number;
}

export type ParsedContent={
	title: string;
	markdown: string;
	sections: Section[];
}

const turndownService=new TurndownService({
	headingStyle: 'atx',
	codeBlockStyle: 'fenced',
	bulletListMarker: '-',
});

turndownService.addRule('pre',{
	filter: 'pre',
	replacement: (content,node) => {
		const element=node as unknown as Element;
		const code=element.textContent||content;
		const lang=element.querySelector('code')?.className?.match(/language-(\w+)/)?.[1]||'';
		return `\n\`\`\`${lang}\n${code.trim()}\n\`\`\`\n`;
	}
});

turndownService.addRule('table',{
	filter: 'table',
	replacement: (content) => `\n${content}\n`
});

export function extractContent(rawHtml: string): ParsedContent {
	const $=cheerio.load(rawHtml);
	const title=$('title').text().trim()||$('h1').first().text().trim()||'Untitled';

	$(
		'script, style, nav, aside, .sidebar, [role="navigation"], '+
		'img, svg, iframe, noscript, .breadcrumb, .breadcrumbs, '+
		'.nav-links, .page-nav, .edit-link, .footer, footer, header, '+
		'.header, .toc, #toc, .table-of-contents'
	).remove();

	const mainContent=$(
		'main, article, .content, #content, .main-content, '+
		'.article-content, .documentation, .doc-content, [role="main"]'
	).first();

	const contentHtml=mainContent.length>0? mainContent.html():$('body').html();
	if (!contentHtml) return {title,markdown: '',sections: []};

	const markdown=turndownService.turndown(contentHtml);
	const sections=splitIntoSections(markdown);
	return {title,markdown,sections};
}

export function extractHeadings(rawHtml: string): string[] {
	const $=cheerio.load(rawHtml);
	const headings: string[]=[];
	$('h1, h2, h3, h4').each((_,el) => {
		const text=$(el).text().trim();
		if (text) headings.push(text);
	});
	return headings;
}

export function extractSparseContent(rawHtml: string): string {
	const $=cheerio.load(rawHtml);
	const parts: string[]=[];

	$('h1, h2, h3').each((_,el) => {
		const text=$(el).text().trim();
		if (text) parts.push(text);
	});

	const metaDesc=$('meta[name="description"]').attr('content');
	if (metaDesc) parts.push(metaDesc);

	$('b, strong').each((_,el) => {
		const text=$(el).text().trim();
		if (text&&text.length<100) parts.push(text);
	});

	return parts.join(' . ');
}

function splitIntoSections(markdown: string): Section[] {
	const sections: Section[]=[];
	const lines=markdown.split('\n');
	let currentHeadings: string[]=[];
	let currentContent: string[]=[];
	let currentAnchor: string|undefined;
	const headingRegex=/^(#{1,4})\s+(.+)$/;

	for (const line of lines) {
		const match=line.match(headingRegex);
		if (match) {
			if (currentContent.length>0||currentHeadings.length>0) {
				const content=currentContent.join('\n').trim();
				if (content.length>0) {
					sections.push({
						heading: [...currentHeadings],
						content,
						anchor: currentAnchor,
						wordCount: countWords(content)
					});
				}
			}
			const level=match[1].length;
			const headingText=match[2].trim();
			currentHeadings=currentHeadings.slice(0,level-1);
			currentHeadings.push(headingText);
			currentAnchor=generateAnchor(headingText);
			currentContent=[];
		} else {
			currentContent.push(line);
		}
	}

	if (currentContent.length>0) {
		const content=currentContent.join('\n').trim();
		if (content.length>0) {
			sections.push({
				heading: [...currentHeadings],
				content,
				anchor: currentAnchor,
				wordCount: countWords(content)
			});
		}
	}
	return sections;
}

function generateAnchor(heading: string): string {
	return heading
		.toLowerCase()
		.replace(/[^\w\s-]/g,'')
		.replace(/\s+/g,'-')
		.replace(/-+/g,'-')
		.trim();
}

function countWords(text: string): number {
	return text.split(/\s+/).filter(word => word.length>0).length;
}

// export function extractRelevantSections(
// 	sections: Section[],
// 	query: string,
// 	maxSections: number=5,
// 	maxWords: number=500
// ): Section[] {
// 	const queryTerms=query.toLowerCase().split(/\s+/).filter(t => t.length>2);
// 	if (queryTerms.length===0) return limitSections(sections,maxSections,maxWords);

// 	const scored=sections.map(section => {
// 		const text=(section.heading.join(' ')+' '+section.content).toLowerCase();
// 		let score=0;
// 		for (const term of queryTerms) {
// 			const matches=text.match(new RegExp(term,'gi'))||[];
// 			score+=matches.length;
// 			if (section.heading.some(h => h.toLowerCase().includes(term))) {
// 				score+=5;
// 			}
// 		}
// 		return {section,score};
// 	});

// 	const relevant=scored
// 		.filter(s => s.score>0)
// 		.sort((a,b) => b.score-a.score)
// 		.map(s => s.section);

// 	return limitSections(relevant,maxSections,maxWords);
// }

// function limitSections(sections: Section[],maxSections: number,maxWords: number): Section[] {
// 	const result: Section[]=[];
// 	let totalWords=0;

// 	for (const section of sections) {
// 		if (result.length>=maxSections) break;
// 		if (totalWords+section.wordCount>maxWords) {
// 			if (result.length===0&&section.wordCount>0) {
// 				result.push(section);
// 			}
// 			break;
// 		}
// 		result.push(section);
// 		totalWords+=section.wordCount;
// 	}
// 	return result;
// }

export function formatSectionsAsMarkdown(sections: Section[]): string {
	return sections.map(section => {
		const headingPrefix='#'.repeat(Math.min(section.heading.length,4));
		const headingText=section.heading[section.heading.length-1]||'';
		if (headingText) {
			return `${headingPrefix} ${headingText}\n\n${section.content}`;
		}
		return section.content;
	}).join('\n\n---\n\n');
}
