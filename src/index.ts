// import {readFileSync} from "fs";
import {MCPServer} from "mcp-use/server";
// import {dirname,join} from "path";
// import {fileURLToPath} from "url";
import {env} from "./config/env.js";
import {runIndexer} from "./indexer/indexer.js";
import {initDb} from "./services/db.js";
import {readDocTool} from "./tools/readDoc.js";
import {searchDocsTool} from "./tools/searchDocs.js";

// Load prompt template from prompt.md
// const __filename=fileURLToPath(import.meta.url);
// const __dirname=dirname(__filename);
// const promptTemplate=readFileSync(join(__dirname,"prompt.md"),"utf-8");

initDb();

const server=new MCPServer({
  name: "tvc-docs-server",
  version: "1.0.0",
  description: "MCP server for TVC/TIF documentation search",
});

// Register search_docs tool
server.tool(
  {
    name: searchDocsTool.name,
    description: searchDocsTool.description,
    schema: searchDocsTool.schema
  },
  searchDocsTool.handler
);

// Register read_doc tool
server.tool(
  {
    name: readDocTool.name,
    description: readDocTool.description,
    schema: readDocTool.schema
  },
  readDocTool.handler
);

// function loadPrompt(topic: string) {
//   const seedUrlsList=env.seedUrls.map(s => `- **${s.name}**: ${s.url}`).join('\n');
//   return promptTemplate
//     .replace(/\$\{topic\}/g,topic)
//     .replace(/\$\{env\.seedUrls\.map\(s => `- \*\*\$\{s\.name\}\*\*: \$\{s\.url\}`\)\.join\('\\n'\)\}/g,seedUrlsList);
// }

// server.prompt(
//   {
//     name: "search-docs",
//     description: "Help construct documentation searches for TVC/TIF",
//     args: [{name: "topic",type: "string",required: true}]
//   },
//   async (params: Record<string,unknown>) => {
//     const topic=params.topic as string;
//     return {
//       messages: [{
//         role: "user",
//         content: {
//           type: "text",
//           text: loadPrompt(topic)
//         }
//       }]
//     };
//   }
// );

if (env.INIT_ON_START) {
  console.log('Starting documentation indexing...');
  try {
    const results=await runIndexer();
    console.log('Indexer complete:',results.map(r =>
      `${r.sourceName}: ${r.status}${r.pagesProcessed? ` (${r.pagesProcessed} pages)`:''}`
    ).join(', '));
  } catch (error) {
    console.error('Indexer error:',error);
  }
}

console.log(`TVC Docs MCP Server starting on port ${env.PORT}`);
server.listen(env.PORT);