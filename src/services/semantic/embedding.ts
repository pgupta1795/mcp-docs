
import {pipeline} from "@xenova/transformers";
import {env} from "../../config/env.js";

let extractor: any=null;

export class EmbeddingService {
	private static instance: EmbeddingService|null=null;
	private isInitialized=false;
	private constructor() { }

	static getInstance(): EmbeddingService {
		if (!EmbeddingService.instance) {
			EmbeddingService.instance=new EmbeddingService();
		}
		return EmbeddingService.instance;
	}

	async initialize(): Promise<void> {
		if (this.isInitialized) return;
		try {
			console.log(`Initializing embedding model: ${env.EMBEDDING_MODEL}...`);
			extractor=await pipeline("feature-extraction",env.EMBEDDING_MODEL,{
				quantized: true,
			});
			this.isInitialized=true;
			console.log("Embedding model initialized successfully");
		} catch (error) {
			console.error("Failed to initialize embedding model",error);
			throw error;
		}
	}

	async generateEmbeddings(texts: string[]): Promise<Float32Array[]> {
		await this.initialize();
		if (!extractor) throw new Error("Embedding model not initialized");

		const embeddings: Float32Array[]=[];
		const BATCH_SIZE=16;

		for (let i=0;i<texts.length;i+=BATCH_SIZE) {
			const batch=texts.slice(i,i+BATCH_SIZE);

			for (const text of batch) {
				try {
					// Truncate to avoid token limit issues (approx 512 tokens)
					const truncatedText=text.slice(0,2000);
					const output=await extractor(truncatedText,{
						pooling: "mean",
						normalize: true,
					});
					embeddings.push(new Float32Array(output.data));
				} catch (error) {
					console.error("Failed to embed text",error);
					embeddings.push(new Float32Array(384)); // Fallback zero vector
				}
			}
		}
		return embeddings;
	}
}

export function getEmbeddingService(): EmbeddingService {
	return EmbeddingService.getInstance();
}
