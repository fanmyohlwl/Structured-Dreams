# AI Generation Layer

这个模块用于隔离 AI 图片生成能力，避免编辑器 UI、block model 和 canvas 渲染逻辑直接依赖某个厂商。

## 结构

```text
frontend/src/features/ai/
  config/
    providerConfig.ts
  providers/
    AIGenerationProvider.ts
  mocks/
    MockAIGenerationProvider.ts
  services/
    AIGenerationService.ts
  types/
    index.ts
```

## 当前规则

- UI 只依赖 `AIGenerationService`
- provider 只返回统一的请求/响应结构
- canvas 渲染只消费 block data 和资源地址
- 前端默认不直接调用任何第三方模型 API，而是调用自有后端网关

## 当前前后端边界

- 前端保留：
  - canvas 编辑
  - block 管理
  - inspector 参数调整
  - 实时预览
  - 编辑状态更新
- 后端负责：
  - API key
  - 模型名称
  - APIMart / OpenAI / Replicate 等 provider 适配
  - 请求重试
  - 供应商错误归一化
  - 第三方 AI 调用

## 未来替换 mock 的步骤

1. 在前端 `config/providerConfig.ts` 中配置后端网关地址
2. 前端继续通过 `BackendAIGenerationProvider` 调用自有接口
3. 在 `backend/src/ai/providers` 中新增或替换真实 provider
4. 在后端 service 中切换默认 provider

这样不需要重写：

- 编辑器 UI
- block model
- canvas 渲染逻辑
- 导出逻辑
