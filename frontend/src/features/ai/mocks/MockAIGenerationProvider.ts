import type { AIGenerationProvider } from "../providers/AIGenerationProvider";
import type {
  AIGenerationRequest,
  AIGenerationResponse,
  AIProviderRuntimeConfig,
  AIProviderId,
} from "../types";

const now = () => new Date().toISOString();

const createId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const createPlaceholderDataUrl = (prompt: string) => {
  const safePrompt = prompt.replace(/[<>&"]/g, "");
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#f2efe8" />
          <stop offset="100%" stop-color="#d8e4ec" />
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" fill="url(#bg)" rx="0" />
      <rect x="72" y="72" width="880" height="880" fill="none" stroke="#232323" stroke-width="4" stroke-dasharray="16 12" rx="0" />
      <text x="512" y="410" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="34" fill="#232323">
        Mock AI Image Placeholder
      </text>
      <text x="512" y="472" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="22" fill="#4b5563">
        Provider: mock
      </text>
      <foreignObject x="170" y="548" width="684" height="180">
        <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Helvetica, Arial, sans-serif; font-size: 24px; color: #232323; text-align: center; line-height: 1.45;">
          ${safePrompt || "No prompt provided"}
        </div>
      </foreignObject>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

interface MockStoredGeneration {
  response: AIGenerationResponse;
  pollCount: number;
}

export class MockAIGenerationProvider implements AIGenerationProvider {
  readonly providerId: AIProviderId = "mock";

  readonly displayName = "Mock Image Generation Provider";

  private generations = new Map<string, MockStoredGeneration>();

  constructor(private readonly config?: AIProviderRuntimeConfig) {
    void this.config;
  }

  async generateImage(
    request: AIGenerationRequest,
  ): Promise<AIGenerationResponse> {
    const timestamp = now();
    const generationId = createId("generation");

    const response: AIGenerationResponse = {
      generationId,
      providerId: this.providerId,
      blockId: request.blockId,
      status: "queued",
      createdAt: timestamp,
      updatedAt: timestamp,
      progress: 5,
      images: [],
      warnings: [
        "This is mock placeholder image data. Connect a real provider later.",
      ],
    };

    this.generations.set(generationId, {
      response,
      pollCount: 0,
    });

    return response;
  }

  async getGenerationResult(generationId: string): Promise<AIGenerationResponse> {
    const stored = this.generations.get(generationId);

    if (!stored) {
      throw new Error(`Mock generation not found: ${generationId}`);
    }

    stored.pollCount += 1;

    if (stored.pollCount === 1) {
      stored.response = {
        ...stored.response,
        status: "running",
        progress: 55,
        updatedAt: now(),
      };
      this.generations.set(generationId, stored);
      return stored.response;
    }

    if (stored.response.status !== "completed") {
      stored.response = {
        ...stored.response,
        status: "completed",
        progress: 100,
        updatedAt: now(),
        images: [
          {
            assetId: createId("asset"),
            url: createPlaceholderDataUrl(
              `Generated for block ${stored.response.blockId}`,
            ),
            previewUrl: createPlaceholderDataUrl("Preview image"),
            mimeType: "image/svg+xml",
            width: 1024,
            height: 1024,
            providerMetadata: {
              source: "mock-provider",
            },
          },
        ],
      };
      this.generations.set(generationId, stored);
    }

    return stored.response;
  }

  async cancelGeneration(generationId: string): Promise<void> {
    const stored = this.generations.get(generationId);

    if (!stored) {
      return;
    }

    stored.response = {
      ...stored.response,
      status: "cancelled",
      updatedAt: now(),
    };

    this.generations.set(generationId, stored);
  }
}

/*
未来换成真实 provider 时：

1. 在构造函数中读取 config.apiKey / config.baseUrl / config.model
2. 在 generateImage() 中发起真实 HTTP 请求，提交生成任务
3. 在 getGenerationResult() 中轮询真实任务状态或读取结果
4. 把真实返回值映射为统一的 AIGenerationResponse

只要保持返回结构不变，编辑器 UI 不需要知道当前是 mock 还是真实供应商。
*/
