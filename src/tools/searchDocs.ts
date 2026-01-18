import {z} from "zod";
import {getSearchOrchestrator} from "../services/search-orchestrator.js";

const searchOrchestrator=getSearchOrchestrator();

export const searchDocsTool={
	name: "search_docs",
	description: "Search TVC/TIF documentation using semantic, FTS, or hybrid search based on configuration.",
	schema: z.object({
		query: z.string().describe("Search keywords or phrase"),
		limit: z.number().optional().default(10).describe("Maximum number of results (default 10)")
	}),
	handler: async ({query,limit=10}: {query: string; limit?: number}) => {
		const results=await searchOrchestrator.search(query,limit);

		if (results.length===0) {
			return {
				content: [{
					type: "text" as const,
					text: "No results found for your query. Try different keywords."
				}]
			};
		}

		// Format results as a list with source info
		const text=results.map((r,i) => {
			const sourceTag=r.source!=='fts'? ` [${r.source}]`:'';
			return `${i+1}. [${r.title}](${r.url})${sourceTag}\n   ${r.snippet}`;
		}).join("\n\n");

		return {
			content: [{
				type: "text" as const,
				text: `Found ${results.length} documents:\n\n${text}`
			}]
		};
	}
};
