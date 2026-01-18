import {z} from "zod";
import {ContentService} from "../services/content.js";

const contentService=new ContentService();

export const readDocTool={
	name: "read_doc",
	definition: {
		title: "Read Documentation",
		description: "Read the content of a specific documentation page. Fetches the URL and returns Markdown.",
		inputSchema: z.object({
			url: z.string().describe("URL of the page to read (from search results)"),
			selector: z.string().optional().describe("Optional CSS selector to extract a specific section (e.g. '#section-id')")
		})
	},
	handler: async (args: any) => {
		const {url,selector}=args;

		try {
			const markdown=await contentService.getDocContent(url,selector);

			return {
				content: [{
					type: "text" as const,
					text: markdown
				}]
			};
		} catch (error) {
			const msg=error instanceof Error? error.message:"Unknown error";
			return {
				isError: true,
				content: [{
					type: "text" as const,
					text: `Failed to read document: ${msg}`
				}]
			};
		}
	}
};
