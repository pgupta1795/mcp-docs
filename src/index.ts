import {serve} from '@hono/node-server';
import {env} from './config/env.js';
import {logger} from './config/logger.js';
import {initializeServices} from './mcp/docs/server.js';
import {startHttpServer} from './transports/http.js';
import {startStdioServer} from './transports/stdio.js';

async function main() {
  await initializeServices();
  logger.info(`=== Server starting in ${env.TRANSPORT} mode ===`);

  if (env.TRANSPORT==='stdio') {
    await startStdioServer();
  } else if (env.TRANSPORT==='http') {
    const app=await startHttpServer();
    serve({
      fetch: app.fetch,
      port: env.PORT,
    },(info) => {
      logger.debug(`HTTP Server listening on http://${info.address}:${info.port}`);
    });
  } else {
    logger.error(`Invalid transport mode: ${env.TRANSPORT}`);
    process.exit(1);
  }
  logger.info(`=== Server started in ${env.TRANSPORT} mode ===`);
}

main().catch((error) => {
  logger.error({error},"Fatal error during startup");
  process.exit(1);
});