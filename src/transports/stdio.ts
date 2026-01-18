import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
import {logger} from "../config/logger.js";
import {createMcpServer} from "../mcp/docs/server.js";

export async function startStdioServer() {
	logger.info("Starting Stdio Server...");
	const server=createMcpServer();
	const transport=new StdioServerTransport();
	await server.connect(transport);
	process.stdin.resume();
	const cleanup=async () => {
		logger.info("Closing stdio server...");
		await server.close();
		process.exit(0);
	};
	process.on('SIGINT',cleanup);
	process.on('SIGTERM',cleanup);
}
