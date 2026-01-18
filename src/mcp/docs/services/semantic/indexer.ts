
import {logger} from '@/config/logger.js';
import * as cheerio from "cheerio";
import crypto from "crypto";
import {db} from "../db.js";
import {getEmbeddingService} from "./embedding.js";

interface ParsedChunk {
	docId: string;
	chunkText: string;
}

const MAX_CHUNK_CHARS=1500;

export class SemanticIndexer {
	private embeddingService=getEmbeddingService();

	/**
	 * Index a single page's content for semantic search
	 */
	async indexPage(url: string,htmlContent: string,title: string): Promise<void> {
		// Generate document ID (hash of URL to match documents table)
		const docId=crypto.createHash("md5").update(url).digest("hex");

		// Clear existing chunks for this doc
		const deleteChunks=db.prepare("DELETE FROM vec_chunks WHERE doc_id = ?");
		deleteChunks.run(docId);

		// Parse and chunk
		const chunks=this.parseAndChunk(docId,htmlContent,title);
		if (chunks.length===0) return;

		// Generate embeddings
		const texts=chunks.map(c => c.chunkText);
		const embeddings=await this.embeddingService.generateEmbeddings(texts);

		// Insert into vec0
		const insertChunk=db.prepare(`
            INSERT INTO vec_chunks(doc_id, chunk_embedding, chunk_text)
            VALUES (?, ?, ?)
        `);

		for (let i=0;i<chunks.length;i++) {
			insertChunk.run(docId,embeddings[i],chunks[i].chunkText);
		}

		logger.info(`Indexed ${chunks.length} semantic chunks for ${url}`);
	}

	private parseAndChunk(docId: string,html: string,pageTitle: string): ParsedChunk[] {
		const $=cheerio.load(html);
		const chunks: ParsedChunk[]=[];

		// 1. Title + first paragraph
		const firstPara=$("p").first().text().trim().slice(0,500);
		if (pageTitle||firstPara) {
			chunks.push({
				docId,
				chunkText: `${pageTitle}. ${firstPara}`.trim()
			});
		}

		// 2. Headings and their content
		$("h1, h2, h3, h4").each((_,heading) => {
			const headingText=$(heading).text().trim();
			if (!headingText) return;

			let contentParts: string[]=[headingText];
			let nextEl=$(heading).next();
			let charCount=headingText.length;

			while (nextEl.length&&!nextEl.is("h1, h2, h3, h4")&&charCount<MAX_CHUNK_CHARS) {
				const tagName=nextEl.prop("tagName")?.toLowerCase();

				if (tagName==="p"||tagName==="li"||tagName==="div") {
					const text=nextEl.text().trim();
					if (text.length>10) {
						contentParts.push(text);
						charCount+=text.length;
					}
				} else if (tagName==="ul"||tagName==="ol") {
					nextEl.find("li").each((_,li) => {
						const liText=$(li).text().trim();
						if (liText.length>5) {
							contentParts.push("• "+liText);
							charCount+=liText.length;
						}
					});
				} else if (tagName==="table") {
					nextEl.find("th").each((_,th) => {
						const thText=$(th).text().trim();
						if (thText) {
							contentParts.push(thText);
							charCount+=thText.length;
						}
					});
				}
				nextEl=nextEl.next();
			}

			if (contentParts.length>1||contentParts[0].length>20) {
				const chunkText=`[${pageTitle}] ${contentParts.join(". ")}`;
				chunks.push({
					docId,
					chunkText: chunkText.slice(0,2000)
				});
			}
		});

		return chunks;
	}
}
