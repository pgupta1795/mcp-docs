
import {db} from "../db.js";

interface FtsData {
	url: string;
	title: string;
	headings: string;
	content: string; // Sparse content
}

export class FTSIndexer {

	/**
	 * Index a single page's content for FTS search
	 */
	indexPage(data: FtsData): void {
		const deleteFts=db.prepare("DELETE FROM search_index WHERE url = ?");
		deleteFts.run(data.url);

		const insertFts=db.prepare(`
            INSERT INTO search_index (title, headings, content, url)
            VALUES (@title, @headings, @content, @url)
        `);

		insertFts.run({
			title: data.title,
			headings: data.headings,
			content: data.content,
			url: data.url
		});
	}
}
