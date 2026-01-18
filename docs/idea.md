Below is the **final, authoritative plan**, updated to include:

* **No user-driven ingestion**
* **URLs defined via environment/config**
* **Automatic discovery via site navigation (sidebar / navbar expansion)**
* **One-time + scheduled initialization crawl**
* **Same FTS + LRU + runtime extraction model**

---

# FINAL PLAN: MCP Web Indexing Server (Navigation-Driven Initialization)

---

## 1. High-Level Goal (Restated)

Build an MCP server that:

* Automatically indexes documentation-style websites
* Discovers **all internal pages via navigation menus**
* Uses **SQLite FTS5** as the only index
* Stores **raw HTML as source of truth**
* Extracts content **at query time**
* Uses **LRU caching** to avoid repeated parsing
* Exposes a clean **query-only MCP interface**

Users **never ingest URLs manually**.

---

## 2. System Architecture (Final)

```
┌──────────────────────────┐
│ Environment Configuration│
│  • SEED_URLS             │
│  • NAVIGATION_STRATEGY   │
│  • CRAWL_LIMITS          │
└─────────────┬────────────┘
              │
              ▼
┌───────────────────────────────┐
│     Initialization Pipeline   │
│                               │
│  ┌─────────────────────────┐ │
│  │ Navigation Expander     │ │
│  │  • sidebar expansion    │ │
│  │  • navbar traversal     │ │
│  └───────────┬─────────────┘ │
│              │ discovered URLs│
│  ┌───────────▼────────────┐ │
│  │ Crawlee Crawler         │ │
│  │  • fetch HTML           │ │
│  │  • deduplicate          │ │
│  └───────────┬────────────┘ │
│              │               │
│  ┌───────────▼────────────┐ │
│  │ SQLite                  │ │
│  │  • pages                │ │
│  │  • pages_fts (FTS5)     │ │
│  └───────────┬────────────┘ │
│              │               │
│  ┌───────────▼────────────┐ │
│  │ LRU Cache               │ │
│  │  • parsed DOM           │ │
│  └─────────────────────────┘ │
└───────────────────────────────┘
              ▲
              │
┌─────────────┴──────────────┐
│        MCP Server           │
│  • query_knowledge          │
└────────────────────────────┘
```

---

## 3. Configuration-Driven Initialization (No User Ingest)

### Environment / Config File

```
SEED_URLS=
NAVIGATION_MODE=sidebar | navbar | auto
CRAWL_MAX_DEPTH=5
CRAWL_MAX_PAGES=1000
INIT_ON_START=true
RECRAWL_INTERVAL=24h
```

Initial Seed URLs will be with these keys and urls
- TVC Classic 2025.4.0 = https://products.technia.com/app/docs/tvc-documentation-2025.4.0/tvc/install/index.html
- TVC Helium 2025.4.0 = https://products.technia.com/app/docs/tvc-helium-documentation-2025.4.0/index.html
- TIF Classic 2025.4.0 = https://products.technia.com/app/docs/tif-documentation-2025.4.0/tif-classic/2025.4.0/main/index.html
- TIF Cloud = https://forseven.tifdemo.technia.cloud/docs/tif-cloud/Current/main/index.html

### Key Principle

> **The system owns ingestion. Users only query.**

---

## 4. HTML Parsing & Chunking Strategy

-   **Parsing:** Use Cheerio to target the main content area (e.g., `#main-content`, `.article-body`). Strip `<script>`, `<style>`, and `<img>` tags.
-   **Markdown Conversion:** Use `turndown` to convert the cleaned HTML into Markdown. AI handles Markdown better than raw HTML, and it reduces token count.
-   **Dynamic Chunking:** When the AI requests a file, don't return the whole 100KB document. Break it into sections based on `<h2>` or `<h3>` tags.
-   **Caching:** Store the `turndown` output in a local `.cache` folder (using `Map` or a simple key-value store like `lowdb`). Check the `mtime` (modified time) of the source file before serving from cache.

### HTML Parsing

Use **DOM-based parsing**, not regex.

### Content Extraction Rules

Strip:

* nav bars
* side menus
* breadcrumbs duplication
* scripts, styles
* images (`<img>`)

Keep:

* `<h1–h4>`
* `<p>`, `<li>`, `<code>`, `<pre>`
* tables (flatten to text)

### Chunking Strategy (Critical)

Chunk by **semantic structure**, not tokens:

```ts
Chunk {
  docId
  headingPath: ["Installation", "System Requirements"]
  text: "CATIA requires Windows 10..."
}
```

Chunk size:

* 300–800 words max
* One logical topic per chunk

---

## 5. Caching Strategy (Essential on Windows)

### Multi-Level Cache

**Level 1 – Metadata (Always Loaded)**

* JSON / SQLite
* Memory resident

**Level 2 – Parsed HTML Cache**

* LRU cache of parsed documents
* Size: ~50–100 docs

**Level 3 – Chunk Cache**

* Cache most-requested chunks
* Key: `docId + headingPath`

Libraries:

* `lru-cache`
* filesystem-based cache for persistence (optional)

---

## 4. Initialization Workflow (Critical)

This replaces `ingest_urls` entirely.

### Step 1: Load Seed URLs

* Read `SEED_URLS` from environment
* Treat each as a **documentation root**

---

### Step 2: Navigation Expansion Phase (Discovery)

**Goal:** discover *all content URLs* without brute-force crawling.

#### Strategies (Auto-selected or Configured)

##### A. Sidebar Expansion

Used for documentation frameworks.

* Detect:

  * `<nav>`
  * `<aside>`
  * `.sidebar`
* Expand:

  * Collapsible elements
  * Nested lists
* Extract:

  * All `<a href>` links
* Normalize URLs

##### B. Top Navigation Bar Expansion

Used for marketing-style docs.

* Detect:

  * `<header>`
  * `.navbar`
* Follow dropdown menus
* Extract internal links only

##### C. Fallback: Controlled Crawling

If no navigation detected:

* Crawl same-domain links
* Respect depth/page limits

---

### Output of This Phase

```
Set<CanonicalURL>
```

This set becomes the **authoritative page list**.

---

## 5. Crawling & Storage Phase

For each discovered URL:

* Fetch HTML once
* Strip:

  * scripts
  * styles
* Store:

  * URL
  * Title
  * Raw HTML
  * Timestamp

SQLite triggers automatically update the **FTS5 virtual table**.

---

## 6. SQLite Role (Finalized)

### What SQLite Is

* Persistent store
* **Full-text index**
* URL registry

### What SQLite Is NOT

* Not a cache
* Not a semantic search engine

### Tables

| Table       | Purpose                     |
| ----------- | --------------------------- |
| `pages`     | Raw HTML + metadata         |
| `pages_fts` | Keyword search index (FTS5) |

---

## 7. LRU Cache (Query-Time Optimization)

### Purpose

Avoid repeating:

* SQLite HTML reads
* Cheerio parsing
* DOM traversal

### Cached Items

| Key          | Value              |
| ------------ | ------------------ |
| `page:{url}` | Parsed DOM         |
| *(optional)* | Extracted snippets |

### Lifecycle

* Filled lazily on first query
* Evicted by LRU or TTL
* Invalidated on re-crawl

---

## 8. Query Flow (End User)

```
User Query
   ↓
SQLite FTS MATCH
   ↓
Relevant URLs (ranked)
   ↓
LRU Cache check
   ├─ HIT → reuse DOM
   └─ MISS → load HTML → parse → cache
   ↓
Runtime extraction
   ↓
Answer + URL references
```

---

## 9. Runtime Extraction Strategy

### Why Runtime

* Queries vary
* Pages are large
* Pre-chunking is wasteful

### Extraction Rules

* Target semantic elements:

  * paragraphs
  * lists
  * code blocks
* Match query terms
* Limit output per page
* Optionally:

  * associate nearest heading
  * generate anchor references

---

## 10. MCP Tooling (Final)

### Exposed Tool(s)

#### `query_knowledge` (Only Public Tool)

**Responsibilities**

* Accept user query
* Search via FTS
* Load pages via cache
* Extract relevant content
* Return:

  * Answer text
  * URLs (and optional sections)

### No ingestion tool exposed to users.

---

## 11. Folder Structure (Final)

```
src/
├─ server.ts                 # MCP server + init hook
│
├─ init/
│  ├─ bootstrap.ts           # runs on startup
│  ├─ discoverLinks.ts       # sidebar/navbar expansion
│  └─ scheduler.ts           # periodic re-crawl
│
├─ crawler/
│  ├─ crawl.ts               # Crawlee runner
│  └─ normalize.ts           # canonical URLs
│
├─ db/
│  ├─ index.ts               # SQLite connection
│  ├─ schema.sql             # tables + FTS + triggers
│  └─ search.ts              # FTS queries
│
├─ cache/
│  ├─ pageCache.ts           # LRU config
│  └─ pageLoader.ts          # cache-aware loader
│
├─ extract/
│  └─ runtimeExtract.ts      # snippet / section logic
│
└─ config/
   └─ env.ts                 # validated environment config
```

---

## 12. Initialization Timing

### Startup

* If `INIT_ON_START=true`
* Run full discovery + crawl

### Scheduled

* Re-run discovery + crawl:

  * Daily
  * Weekly
* Only update changed pages
* Invalidate cache selectively

---

## 13. Why This Design Is Strong

✔ Zero user ingestion complexity
✔ Deterministic indexing
✔ Works perfectly for docs & portals
✔ Minimal infra
✔ Fast query response
✔ Exact citations
✔ MCP-friendly
