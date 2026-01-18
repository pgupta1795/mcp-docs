import {readFileSync} from "fs";
import {MCPServer} from "mcp-use/server";
import {dirname,join} from "path";
import {fileURLToPath} from "url";
import {z} from "zod";
import {loadPage} from "./cache.js";
import {env} from "./config/env.js";
import {initDb} from "./db/db.js";
import {runIndexer} from "./indexer/indexer.js";
import {formatSectionsAsMarkdown} from "./query/extract.js";
import {search,searchInSource} from "./query/search.js";

// Load prompt template from prompt.md
const __filename=fileURLToPath(import.meta.url);
const __dirname=dirname(__filename);
const promptTemplate=readFileSync(join(__dirname,"prompt.md"),"utf-8");

initDb();

const server=new MCPServer({
  name: "tvc-docs-server",
  version: "1.0.0",
  description: "MCP server for TVC/TIF documentation search",
});
server.serverPort

server.tool(
  {
    name: "query_knowledge",
    description: `Search TVC/TIF documentation. Returns relevant content with URL references.
    Available sources: ${env.seedUrls.map(s => s.name).join(', ')}`,
    schema: z.object({
      query: z.string().describe("Search query"),
      source: z.string().optional().describe("Limit to specific source"),
      limit: z.number().optional().default(5).describe("Max results")
    })
  },
  async ({query,source,limit=5}) => {
    const searchResults=source
      ? searchInSource(query,source,limit)
      :search(query,limit);

    if (searchResults.length===0) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({query,results: [],message: "No results found."},null,2)
        }]
      };
    }

    const results=await Promise.all(
      searchResults.map(async (result) => {
        const page=await loadPage(result.url,result.sourceName);
        if (!page) {
          return {
            url: result.url,
            title: result.title,
            source: result.sourceName,
            snippet: result.snippet,
            content: null
          };
        }

        // const sections=extractRelevantSections(page.sections,query,3,300);
        return {
          url: result.url,
          title: result.title||page.title,
          source: result.sourceName,
          content: formatSectionsAsMarkdown(page.sections),
          markdown: page.markdown,
          // relevantSections: page.sections.map(s => ({
          //   heading: s.heading.join(' > '),
          //   anchor: s.anchor? `${result.url}#${s.anchor}`:result.url,
          //   preview: s.content.substring(0,150)+(s.content.length>150? '...':'')
          // }))
        };
      })
    );

    return {
      content: [{
        type: "text",
        text: JSON.stringify({query,resultsCount: results.length,results},null,2)
      }]
    };
  }
);

function loadPrompt(topic: string) {
  const __filename=fileURLToPath(import.meta.url);
  const __dirname=dirname(__filename);
  const promptTemplate=readFileSync(join(__dirname,"prompt.md"),"utf-8");
  const seedUrlsList=env.seedUrls.map(s => `- **${s.name}**: ${s.url}`).join('\n');
  return promptTemplate
    .replace(/\$\{topic\}/g,topic)
    .replace(/\$\{env\.seedUrls\.map\(s => `- \*\*\$\{s\.name\}\*\*: \$\{s\.url\}`\)\.join\('\\n'\)\}/g,seedUrlsList);
}

server.prompt(
  {
    name: "search-docs",
    description: "Help construct documentation searches for TVC/TIF",
    args: [{name: "topic",type: "string",required: true}]
  },
  async (params: Record<string,unknown>) => {
    const topic=params.topic as string;
    return {
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: loadPrompt(topic)
        }
      }]
    };
  }
);

if (env.INIT_ON_START) {
  console.log('Starting documentation indexing...');
  runIndexer().then(results => {
    console.log('Indexer complete:',results.map(r =>
      `${r.sourceName}: ${r.status}${r.pagesProcessed? ` (${r.pagesProcessed} pages)`:''}`
    ).join(', '));
  }).catch(error => {
    console.error('Indexer error:',error);
  });
}

console.log(`TVC Docs MCP Server starting on port ${env.PORT}`);
server.listen(env.PORT);