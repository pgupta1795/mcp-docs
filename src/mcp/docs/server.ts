import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {env} from "../../config/env.js";
import {logger} from "../../config/logger.js";
import {runIndexer} from "./indexer/indexer.js";
import {initDb} from "./services/db.js";
import {readDocTool} from "./tools/readDoc.js";
import {searchDocsTool} from "./tools/searchDocs.js";

export async function initializeServices() {
	logger.info("=== Initializing Services ===");
	logger.info({searchMode: env.SEARCH_MODE},"Search mode configured");

	try {
		initDb();
		if (env.INIT_ON_START) {
			logger.info("Starting documentation indexing...");
			try {
				const results=await runIndexer();
				logger.info({
					results: results.map(r =>
						`${r.sourceName}: ${r.status}${r.pagesProcessed? ` (${r.pagesProcessed} pages)`:''}`
					).join(', ')
				},"Indexer complete");
			} catch (err) {
				logger.error({err},"Indexer error");
			}
		}
	} catch (e) {
		logger.error({error: e},"Failed to initialize services");
	}
	logger.info("=== Services initialization complete ===");
}

export function createMcpServer() {

	logger.info("Creating McpServer instance...");
	const server=new McpServer({
		name: "mcp-docs-server",
		version: "1.0.0",
	});
	logger.debug({searchMode: env.SEARCH_MODE},"McpServer instance created");

	// Register tools
	logger.debug({toolName: searchDocsTool.name},"Registering tool: searchDocs");
	server.registerTool(
		searchDocsTool.name,
		searchDocsTool.definition,
		searchDocsTool.handler
	);
	logger.debug({toolName: searchDocsTool.name},"Tool registered successfully");

	logger.debug({toolName: readDocTool.name},"Registering tool: readDoc");
	server.registerTool(
		readDocTool.name,
		readDocTool.definition,
		readDocTool.handler
	);
	logger.debug({toolName: readDocTool.name},"Tool registered successfully");

	logger.info(`=== MCP Server creation complete 
		\n Search mode : ${env.SEARCH_MODE} 
		\n Transport mode : ${env.TRANSPORT} 
		\n Log level : ${env.LOG_LEVEL} 
		\n Port : ${env.PORT} 
		\n Tools registered : ${searchDocsTool.name},${readDocTool.name} ===`);
	return server;
}
