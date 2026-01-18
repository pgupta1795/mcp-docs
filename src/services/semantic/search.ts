import {db} from "../db.js";
import {getEmbeddingService} from "./embedding.js";

export interface SemanticSearchResult {
	title: string;
	url: string;
	score: number;
	snippet: string;
	chunkText?: string;
}

interface KnnResult {
	doc_id: string;
	chunk_text: string;
	distance: number;
}

interface DocumentMeta {
	title: string;
	url: string;
}

/**
 * Semantic Search Service
 * Performs vector similarity search using sqlite-vec vec0 MATCH queries
 */
export class SemanticSearchService {
	private embeddingService=getEmbeddingService();

	/**
	 * Search using semantic similarity via vec0 KNN
	 * @param query Search query
	 * @param limit Maximum results
	 */
	async search(query: string,limit: number=10): Promise<SemanticSearchResult[]> {
		console.log(`[Semantic] Searching for: ${query}, limit: ${limit}`);

		try {
			const queryEmbedding=await this.embeddingService.generateEmbeddings([query]);
			const vec=queryEmbedding[0];

			// Use vec0 MATCH query for optimized KNN search
			const knnResults=db.prepare(`
                SELECT 
                    doc_id,
                    chunk_text,
                    distance
                FROM vec_chunks
                WHERE chunk_embedding MATCH ?
                    AND k = ?
            `).all(vec,limit*3) as KnnResult[]; // Get more for dedup

			console.log(`[Semantic] KNN returned ${knnResults.length} chunks`);

			if (knnResults.length===0) {
				return [];
			}

			// Deduplicate by document and get metadata
			const seenDocs=new Set<string>();
			const topResults: SemanticSearchResult[]=[];

			for (const result of knnResults) {
				if (seenDocs.has(result.doc_id)) continue;
				seenDocs.add(result.doc_id);

				// Get document metadata
				const doc=db.prepare(`
                    SELECT title, url 
                    FROM documents 
                    WHERE id = ?
                `).get(result.doc_id) as DocumentMeta|undefined;

				if (doc) {
					// Convert distance to similarity score (cosine distance: lower is better)
					const similarityScore=1-(result.distance/2);

					topResults.push({
						title: doc.title,
						url: doc.url,
						score: similarityScore,
						snippet: this.createSnippet(result.chunk_text,query),
						chunkText: result.chunk_text
					});
				}

				if (topResults.length>=limit) break;
			}

			console.log(`[Semantic] Returning ${topResults.length} results`);
			return topResults;

		} catch (error) {
			console.error('[Semantic] Search failed:',error);
			return [];
		}
	}

	/**
	 * Create a readable snippet from chunk text
	 */
	private createSnippet(chunkText: string,query: string): string {
		// Remove document title prefix if present
		let text=chunkText.replace(/^\[.*?\]\s*/,"");

		// Find the most relevant part of the text
		const queryTerms=query.toLowerCase().split(/\s+/);
		const sentences=text.split(/[.!?]+/).filter(s => s.trim().length>10);

		// Score each sentence by query term matches
		let bestSentence=sentences[0]||text;
		let bestScore=0;

		for (const sentence of sentences) {
			const lowerSentence=sentence.toLowerCase();
			let score=0;
			for (const term of queryTerms) {
				if (lowerSentence.includes(term)) score++;
			}
			if (score>bestScore) {
				bestScore=score;
				bestSentence=sentence;
			}
		}

		// Truncate to reasonable length
		const maxLength=200;
		if (bestSentence.length>maxLength) {
			return bestSentence.slice(0,maxLength).trim()+"...";
		}
		return bestSentence.trim();
	}
}
