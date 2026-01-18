import {StreamableHTTPTransport} from '@hono/mcp';
import {Hono} from 'hono';
import {env} from '../config/env.js';
import {logger} from '../config/logger.js';
import {createMcpServer} from '../mcp/docs/server.js';

export async function startHttpServer() {
	const app=new Hono();
	const mcpServer=createMcpServer();
	const transport=new StreamableHTTPTransport();
	await mcpServer.connect(transport);
	app.all('/docs/mcp',async (c) => {
		if (!mcpServer.isConnected()) {
			await mcpServer.connect(transport);
		}
		return transport.handleRequest(c);
	});
	app.get('/health',(c) => c.text('OK'));
	logger.debug(`HTTP Server starting on port ${env.PORT}...`);
	return app;
}
