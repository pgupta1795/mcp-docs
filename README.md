# MCP Docs Server

MCP server for documentation search with automatic web indexing.

[![npm version](https://badge.fury.io/js/%40pgupta1795%2Fmcp-docs.svg)](https://www.npmjs.com/package/@pgupta1795/mcp-docs)

## Usage via npx (Recommended)

Run the MCP server directly without installation:

```bash
# STDIO mode (for MCP client integration)
SEED_URLS="Docs|https://example.com/docs|sidebar|0" TRANSPORT=stdio npx @pgupta1795/mcp-docs

# HTTP mode
SEED_URLS="Docs|https://example.com/docs|sidebar|0" TRANSPORT=http npx @pgupta1795/mcp-docs
```

### MCP Client Configuration (npx)

```json
{
  "mcpServers": {
    "docs": {
      "command": "npx",
      "args": ["-y", "@pgupta1795/mcp-docs"],
      "env": {
        "TRANSPORT": "stdio",
        "SEED_URLS": "TVC Classic 2025.4.0|https://products.technia.com/app/docs/tvc-documentation-2025.4.0/tvc/install/index.html|navbar|0,TVC Helium 2025.4.0|https://products.technia.com/app/docs/tvc-helium-documentation-2025.4.0/index.html|navbar|0,TIF Classic 2025.4.0|https://products.technia.com/app/docs/tif-documentation-2025.4.0/tif-classic/2025.4.0/main/index.html|sidebar|0,TIF Cloud|https://forseven.tif.technia.cloud/docs/tif-cloud/Current/main/index.html|sidebar|0",
        "SEARCH_MODE": "SEMANTIC_ONLY",
        "DB_PATH": "C:/GBS/Search_Tool/mcp-docs/data/mcp-docs.db"
      }
    }
  }
}
```

---

## Quick Start (Local Development)

```bash
npm install
npm run build
```

## Running the Server

### STDIO Mode

```bash
TRANSPORT=stdio npm run start
# Or for development:
npm run dev:stdio
```

### HTTP Mode

```bash
TRANSPORT=http npm run start
# Or for development:
npm run dev:http
```

HTTP endpoint: `http://localhost:5004/docs/mcp`

---

## MCP Client Configuration

### STDIO Mode

```json
{
  "mcpServers": {
    "mcp-docs": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "C:/path/to/mcp-docs",
      "env": {
        "TRANSPORT": "stdio",
        "SEED_URLS": "TVC Classic|https://products.technia.com/app/docs/tvc-documentation-2025.4.0/tvc/install/index.html|sidebar|0"
      }
    }
  }
}
```

### HTTP Mode

```json
{
  "mcpServers": {
    "mcp-docs": {
      "type": "http",
      "url": "http://localhost:5004/docs/mcp"
    }
  }
}
```

---

## Environment Variables

| Variable            | Default                   | Description                                        |
| ------------------- | ------------------------- | -------------------------------------------------- |
| `TRANSPORT`         | `http`                    | Transport mode: `stdio` or `http`                  |
| `PORT`              | `5004`                    | HTTP server port                                   |
| `SEED_URLS`         | _required_                | Documentation sources (see format below)           |
| `DB_PATH`           | `./data/mcp-docs.db`      | SQLite database path                               |
| `INIT_ON_START`     | `true`                    | Auto-index on startup                              |
| `CRAWL_MAX_PAGES`   | `1000`                    | Max pages per source                               |
| `CRAWL_MAX_DEPTH`   | `5`                       | Max crawl depth                                    |
| `CACHE_SIZE`        | `100`                     | LRU cache size                                     |
| `LOG_LEVEL`         | `info`                    | Log level: `debug`, `info`, `warn`, `error`        |
| `LOG_PATH`          | -                         | Optional log file path                             |
| `SEARCH_MODE`       | `SEMANTIC_ONLY`           | Search mode: `FTS_ONLY`, `SEMANTIC_ONLY`, `HYBRID` |
| `EMBEDDING_MODEL`   | `Xenova/all-MiniLM-L6-v2` | Embedding model for semantic search                |
| `SEMANTIC_TOP_K`    | `20`                      | Top K results for semantic search                  |
| `HYBRID_FTS_WEIGHT` | `0.4`                     | FTS weight in hybrid mode (0-1)                    |

### SEED_URLS Format

```
name|url|navigationMode|recrawlIntervalHours
```

- **navigationMode**: `sidebar`, `navbar`, or `auto`
- **recrawlIntervalHours**: `0` = never, `24` = daily

Example:

```env
SEED_URLS=TVC Classic|https://products.technia.com/app/docs/tvc-documentation-2025.4.0/tvc/install/index.html|sidebar|0,TIF Cloud|https://forseven.tifdemo.technia.cloud/docs/tif-cloud/Current/main/index.html|auto|24
```
