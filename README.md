# MCP TVC Docs Server

MCP server for TVC/TIF documentation search with automatic web indexing.

## Features

- **Automatic Documentation Indexing**: Crawls documentation sites via navigation links (sidebar/navbar)
- **Full-Text Search**: Uses SQLite FTS5 for fast keyword search with BM25 ranking
- **Smart Content Extraction**: Converts HTML to markdown and splits into semantic sections
- **LRU Caching**: Caches parsed content for fast repeated access
- **Per-Source Configuration**: Each documentation source has its own navigation mode and recrawl settings

## Available Documentation Sources

| Source | URL | Recrawl |
|--------|-----|---------|
| TVC Classic 2025.4.0 | [Link](https://products.technia.com/app/docs/tvc-documentation-2025.4.0/tvc/install/index.html) | Never |
| TVC Helium 2025.4.0 | [Link](https://products.technia.com/app/docs/tvc-helium-documentation-2025.4.0/index.html) | Never |
| TIF Classic 2025.4.0 | [Link](https://products.technia.com/app/docs/tif-documentation-2025.4.0/tif-classic/2025.4.0/main/index.html) | Never |
| TIF Cloud | [Link](https://forseven.tifdemo.technia.cloud/docs/tif-cloud/Current/main/index.html) | Daily |

## Installation

```bash
# Install dependencies
npm install

# Build the project
npm run build
```

## Configuration

Copy `env.example` to `.env` and configure:

```env
# Maximum pages to crawl per seed URL
CRAWL_MAX_PAGES=1000

# Whether to start indexing on server startup
INIT_ON_START=true

# Path to SQLite database file
DB_PATH=./data/tvc-docs.db

# LRU cache size (number of parsed pages)
CACHE_SIZE=100

# Server port
PORT=3000
```

## Running the Server

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm run start
```

## MCP Tools

### `query_knowledge`

Search the documentation index and get relevant content with URL references.

**Parameters:**
- `query` (required): Search query - use specific terms
- `source` (optional): Limit to specific source (e.g., "TVC Classic 2025.4.0")
- `limit` (optional): Maximum results (default: 5)

**Example:**
```json
{
  "query": "installation requirements",
  "source": "TVC Classic 2025.4.0",
  "limit": 3
}
```

**Response:**
```json
{
  "query": "installation requirements",
  "resultsCount": 3,
  "results": [
    {
      "url": "https://example.com/docs/install",
      "title": "Installation Guide",
      "source": "TVC Classic 2025.4.0",
      "content": "## System Requirements\n\nTVC requires...",
      "relevantSections": [
        {
          "heading": "Installation > System Requirements",
          "anchor": "https://example.com/docs/install#system-requirements"
        }
      ]
    }
  ]
}
```

### `get_index_status`

Get current status of the documentation index.

**Response:**
```json
{
  "ready": true,
  "totalPages": 1234,
  "sources": [
    {
      "name": "TVC Classic 2025.4.0",
      "pageCount": 456,
      "lastCrawled": "2025-01-09T12:00:00Z",
      "needsRecrawl": false
    }
  ],
  "cache": {
    "size": 50,
    "maxSize": 100
  }
}
```

## MCP Prompts

### `search-docs`

Helps construct effective documentation searches.

**Args:**
- `topic`: The topic you want to search for

## Architecture

```
src/
├─ index.ts              # MCP server entry point
├─ config/
│  └─ env.ts             # Configuration with per-URL settings
├─ init/
│  ├─ bootstrap.ts       # Startup initialization
│  └─ discoverLinks.ts   # Navigation link discovery
├─ crawler/
│  ├─ crawl.ts           # Crawlee-based web crawler
│  └─ normalize.ts       # URL normalization
├─ db/
│  ├─ index.ts           # SQLite connection
│  ├─ schema.sql         # Database schema with FTS5
│  └─ search.ts          # Full-text search queries
├─ cache/
│  ├─ pageCache.ts       # LRU cache
│  └─ pageLoader.ts      # Cache-aware loading
└─ extract/
   └─ runtimeExtract.ts  # HTML to markdown extraction
```

## How It Works

1. **Initialization**: On startup, the server crawls configured seed URLs
2. **Navigation Discovery**: Follows sidebar/navbar links to find all documentation pages
3. **Content Storage**: Stores raw HTML in SQLite with FTS5 indexing
4. **Query Time**: Searches FTS index, loads pages from cache, extracts relevant sections
5. **Response**: Returns content with URL references for citations

## Adding Custom Documentation Sources

Modify `src/config/env.ts` or set `SEED_URLS` environment variable:

```env
SEED_URLS=My Docs|https://example.com/docs|sidebar|0,Other Docs|https://other.com/docs|auto|24
```

Format: `name|url|navigationMode|recrawlIntervalHours`

- **navigationMode**: `sidebar`, `navbar`, or `auto`
- **recrawlIntervalHours**: `0` = never recrawl, `24` = daily, etc.

## License

MIT
