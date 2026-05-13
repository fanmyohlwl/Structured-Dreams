import type { AIProviderSelectionConfig } from "../types";

export const aiProviderSelectionConfig: AIProviderSelectionConfig = {
  defaultProvider: "backend",
  providers: {
    backend: {
      enabled: true,
      baseUrl: "/api/ai",
    },
    mock: {
      enabled: false,
    },
    huggingface: {
      enabled: false,
      apiKey: undefined,
      baseUrl: undefined,
      model: undefined,
    },
    openai: {
      enabled: false,
      apiKey: undefined,
      baseUrl: undefined,
      model: undefined,
    },
  },
};

/*
现在前端默认通过 `backend` provider 调用我们自己的后端接口。

未来切换真实 AI 图片生成供应商时，通常只需要改这里和后端 provider 实现：

1. 在前端这里配置后端网关地址
   - baseUrl: 自有后端接口地址

2. 在后端 provider 配置中填入真实供应商配置
   - apiKey: 真实 API Key
   - baseUrl: 真实接口地址
   - model: 默认模型名
   - extraHeaders: 供应商要求的额外请求头

3. 如需切换网关地址或环境，在前端只改 `backend` provider 配置

这样编辑器 UI、block model、canvas 渲染逻辑都不需要重写。
*/
