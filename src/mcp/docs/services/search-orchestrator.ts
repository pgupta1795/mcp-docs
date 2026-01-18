import {logger} from '@/config/logger.js';
import {env} from "../../../config/env.js";
import {FTSSearchService} from "./fts/search.js";
import {SemanticSearchService} from "./semantic/search.js";

export interface UnifiedSearchResult {
	title: string;
	url: string;
	score: number;
	snippet: string;
	source: 'fts'|'semantic'|'hybrid';
	ftsRank?: number;
	semanticRank?: number;
}

/**
 * Search Orchestrator
 * Supports: FTS_ONLY, SEMANTIC_ONLY, and HYBRID modes
 */
export class SearchOrchestrator {
	private ftsService=new FTSSearchService();
	private semanticService=new SemanticSearchService();

	async search(query: string,limit: number=10): Promise<UnifiedSearchResult[]> {
		const mode=env.SEARCH_MODE;
		logger.info(`[Orchestrator] Search mode: ${mode}, query: ${query}, limit: ${limit}`);

		switch (mode) {
			case 'FTS_ONLY':
				return this.ftsOnlySearch(query,limit);

			case 'SEMANTIC_ONLY':
				return this.semanticOnlySearch(query,limit);

			case 'HYBRID':
				return this.hybridSearch(query,limit);

			default:
				logger.warn(`Unknown search mode: ${mode}, falling back to FTS`);
				return this.ftsOnlySearch(query,limit);
		}
	}

	private ftsOnlySearch(query: string,limit: number): UnifiedSearchResult[] {
		const results=this.ftsService.search(query,limit);

		return results.map((r,idx) => ({
			title: r.title,
			url: r.url,
			score: r.score,
			snippet: r.snippet,
			source: 'fts' as const,
			ftsRank: idx+1
		}));
	}

	private async semanticOnlySearch(query: string,limit: number): Promise<UnifiedSearchResult[]> {
		const results=await this.semanticService.search(query,limit);

		return results.map((r,idx) => ({
			title: r.title,
			url: r.url,
			score: r.score,
			snippet: r.snippet,
			source: 'semantic' as const,
			semanticRank: idx+1
		}));
	}

	/**
	 * Hybrid search using Reciprocal Rank Fusion (RRF)
	 * Combines FTS and semantic results with configurable weights
	 */
	private async hybridSearch(query: string,limit: number): Promise<UnifiedSearchResult[]> {
		logger.info(`[Orchestrator] Executing hybrid search...`);

		// Get more results from each source for better fusion
		const fetchLimit=Math.max(limit*3,30);

		// Run both searches in parallel
		const [ftsResults,semanticResults]=await Promise.all([
			Promise.resolve(this.ftsService.search(query,fetchLimit)),
			this.semanticService.search(query,fetchLimit)
		]);

		logger.info(`[Orchestrator] FTS: ${ftsResults.length}, Semantic: ${semanticResults.length}`);

		// Build document map for RRF
		const docScores=new Map<string,{
			ftsRank: number|null;
			semanticRank: number|null;
			title: string;
			url: string;
			ftsSnippet?: string;
			semanticSnippet?: string;
			ftsScore?: number;
			semanticScore?: number;
		}>();

		// Add FTS results
		ftsResults.forEach((r,idx) => {
			const existing=docScores.get(r.url)||{
				ftsRank: null,
				semanticRank: null,
				title: r.title,
				url: r.url
			};
			existing.ftsRank=idx+1;
			existing.ftsSnippet=r.snippet;
			existing.ftsScore=r.score;
			docScores.set(r.url,existing);
		});

		// Add semantic results
		semanticResults.forEach((r,idx) => {
			const existing=docScores.get(r.url)||{
				ftsRank: null,
				semanticRank: null,
				title: r.title,
				url: r.url
			};
			existing.semanticRank=idx+1;
			existing.semanticSnippet=r.snippet;
			existing.semanticScore=r.score;
			docScores.set(r.url,existing);
		});

		// Calculate RRF scores
		const K=60; // RRF constant
		const ftsWeight=env.HYBRID_FTS_WEIGHT;
		const semanticWeight=1-ftsWeight;

		const scoredDocs: Array<UnifiedSearchResult&{rrfScore: number}>=[];

		for (const [url,doc] of docScores.entries()) {
			let rrfScore=0;

			if (doc.ftsRank!==null) {
				rrfScore+=ftsWeight*(1/(K+doc.ftsRank));
			}

			if (doc.semanticRank!==null) {
				rrfScore+=semanticWeight*(1/(K+doc.semanticRank));
			}

			const snippet=doc.semanticSnippet||doc.ftsSnippet||"";

			scoredDocs.push({
				title: doc.title,
				url: doc.url,
				score: rrfScore,
				snippet,
				source: 'hybrid',
				ftsRank: doc.ftsRank??undefined,
				semanticRank: doc.semanticRank??undefined,
				rrfScore
			});
		}

		// Sort by RRF score (descending)
		scoredDocs.sort((a,b) => b.rrfScore-a.rrfScore);
		const finalResults=scoredDocs.slice(0,limit).map(({rrfScore,...rest}) => rest);
		logger.info(`[Orchestrator] Hybrid returning ${finalResults.length} results (ftsWeight: ${ftsWeight})`);
		return finalResults;
	}
}

let orchestratorInstance: SearchOrchestrator|null=null;

export function getSearchOrchestrator(): SearchOrchestrator {
	if (!orchestratorInstance) {
		orchestratorInstance=new SearchOrchestrator();
	}
	return orchestratorInstance;
}
