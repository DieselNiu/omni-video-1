# image-website → mksaas 迁移清单

> 本文档梳理从 `image-website` 项目迁移到 `mksaas` 的所有模块、文件和边界。
> 生成日期：2026-04-10

---

## ⚠️ 迁移原则

**不得破坏 mksaas 当前页面结构。** 迁移过程中只做增量添加（新增文件、新增路由、新增 schema），不修改或删除现有页面和组件的结构与行为。如果新模块需要与现有页面集成，应通过新增入口点或可选渲染的方式接入，确保现有功能不受影响。

---

## 一、迁移总览

| 模块 | 优先级 | 复杂度 | mksaas 现状 |
|------|--------|--------|------------|
| 图片生成引擎 (Providers + API) | P0 | 高 | 有基础版(Vercel AI SDK)，需替换 |
| 视频生成引擎 (Providers + API) | P0 | 高 | 无 |
| 生成状态管理 (Stores + Hooks) | P0 | 中 | 有 demo 版 hero UI，需对接 |
| Assets 数据表 + CRUD | P0 | 中 | 无 |
| Channel Router (多 Provider 路由) | P1 | 中 | 无 |
| PayPal 支付 | P1 | 高 | 无（仅有 Stripe） |
| Google One Tap 登录 | P1 | 中 | 有 Google OAuth，缺 One Tap |
| NSFW 检测 + 路由 + 拦截弹窗 | P2 | 中 | 无 |
| Watermark 水印 | P2 | 低 | 无 |
| Prompt 优化 | P2 | 低 | 无 |
| 每日签到 | P2 | 低 | 无 |
| Entitlements 权益系统 | P2 | 中 | 无 |
| 反滥用系统（指纹 + 邮箱验证） | P2 | 中 | 无 |
| 通知系统（Discord / 飞书） | P2 | 低 | 无 |
| Video Effects 特效系统（PixVerse） | P3 | 中 | 无 |
| Admin 管理面板（生成/Channel/支付） | P3 | 中 | 有基础 admin，需扩展 |
| 付费用户欢迎邮件 | P3 | 低 | 有邮件系统，缺模板 |
| Asset 管理（mapper + 分页 + 收藏） | P1 | 中 | 无 |
| Dashboard 工作区 + Gallery 系统 | P0 | 高 | 无 |
| 生成表单面板 (image/video/effect) | P0 | 中 | 有 demo 版 hero，需替换 |
| 全局对话框调度 (global-dialogs) | P1 | 中 | 无 |
| 定价对话框体系 (upgrade/credit-packs) | P1 | 中 | 有基础 pricing，需扩展 |
| Premium 权限守卫组件 | P2 | 低 | 无 |
| 积分余额 UI (navbar 按钮 + 菜单) | P1 | 低 | 无 |
| Settings 用户设置页面 (15+ 组件) | P2 | 中 | 有基础 settings，需扩展 |
| CAPTCHA 验证 (Cloudflare Turnstile) | P2 | 低 | 无 |
| Premium 访问检查 (lib/premium-access) | P1 | 低 | 无 |
| 签到 UI 组件 (reward-grid/card/dialog) | P2 | 低 | 无 |
| Stripe 嵌入式结账 React 组件 | P1 | 低 | 有 Stripe SDK，缺 React 组件 |

---

## 二、图片生成引擎

### 2.1 Providers（4 个）

| 源文件 | Channel | 模型 | 认证方式 | 异步模式 |
|--------|---------|------|---------|---------|
| `src/image/providers/KieNanoBananaProvider.ts` | `kie` | nano-banana, nano-banana-edit, nano-banana-pro | KIE_AI_API_KEY | Webhook 回调 |
| `src/image/providers/GoogleNanoBananaProvider.ts` | `google` | gemini-2.5-flash-image, gemini-3-pro-image-preview | GOOGLE_GENERATIVE_AI_API_KEY | 同步返回 |
| `src/image/providers/VertexAINanoBananaProvider.ts` | `vertex` | 同上 (Service Account) | GOOGLE_APPLICATION_CREDENTIALS | 同步返回 |
| `src/image/providers/MaxAPINanoBananaProvider.ts` | `maxapi` | nano-banana, nano-banana-pro | MAXAPI_API_KEY | 轮询 |

**辅助文件：**
- `src/image/providers/factory.ts` — Provider 工厂（单例缓存）
- `src/image/providers/types.ts` — 接口定义
- `src/image/providers/index.ts` — 导出

### 2.2 模型配置

**源文件：** `src/image/config/image-models.ts`

| Model ID | Credits | 特性 |
|----------|---------|------|
| nano-banana | 3 | text-to-image |
| nano-banana-edit | 3 | image-to-image |
| nano-banana-pro | 14 (1K/2K), 18 (4K) | text-to-image + image-to-image, 支持 4K |

**支持的参数：** 宽高比 (1:1, 16:9, 9:16, 4:3, 3:4)，分辨率 (1K/2K/4K Pro only)

### 2.3 API Routes

| 源路径 | 方法 | 说明 |
|--------|------|------|
| `src/app/api/image-generation/submit/route.ts` | POST | 提交图片生成（NSFW 检测 → 扣积分 → 提交 Provider） |
| `src/app/api/image-generation/status/route.ts` | POST | 轮询生成状态（渐进间隔 2s→4s→10s） |
| `src/app/api/image-generation/history/route.ts` | POST | 用户生成历史（分页） |
| `src/app/api/ai-callback/nano-banana/route.ts` | POST | Kie.ai Webhook 回调（下载→水印→上传 R2） |
| `src/app/api/image-generation/webhook/maxapi/route.ts` | POST | MaxAPI Webhook |

### 2.4 Prompt 优化

- `src/image/config/prompts/image-optimization.ts` — text-to-image / image-to-image 两种模式
- 使用 Gemini 3 Flash 生成 60-120 词英文 prompt

---

## 三、视频生成引擎

### 3.1 Providers（15+ 个）

| 源文件 | Channel | 模型系列 | 认证 |
|--------|---------|---------|------|
| `src/video/providers/KieAiVeo3Provider.ts` | `kie` | Veo3 (text/image/reference) | KIE_AI_API_KEY |
| `src/video/providers/KieAiSoraProvider.ts` | `kie` | Sora 2 / Sora 2 Pro | KIE_AI_API_KEY |
| `src/video/providers/KieAiWanProvider.ts` | `kie` | Wan 2.6 | KIE_AI_API_KEY |
| `src/video/providers/MaxApiProvider.ts` | `maxapi` | Seedance 1.5/2.0/2.0-fast | MAXAPI_API_KEY |
| `src/video/providers/MaxAPIVeoProvider.ts` | `maxapi` | Veo 3.1 | MAXAPI_API_KEY |
| `src/video/providers/BytePlusProvider.ts` | `byteplus` | Seedance 1.0/1.5 Pro | BYTEPLUS_API_KEY |
| `src/video/providers/VolcanoProvider.ts` | `volcano` | Seedance | VOLCANO_API_KEY |
| `src/video/providers/AliProvider.ts` | `ali` | Wan 2.2 / Wan 2.6 | ALI_API_KEY |
| `src/video/providers/ApicoreVeo3Provider.ts` | `apicore` | Veo 3.1 | APICORE_API_KEY |
| `src/video/providers/FalProvider.ts` | `fal` | Fal.ai 模型 | FAL_API_KEY |
| `src/video/providers/GoogleVeo3Provider.ts` | `google` | Veo 3.1 (API Key) | GOOGLE_GENERATIVE_AI_API_KEY |
| `src/video/providers/VertexAIVeo3Provider.ts` | `vertex` | Veo 3.1 (Service Account) | GOOGLE_APPLICATION_CREDENTIALS |
| `src/video/providers/PixVerseProvider.ts` | — | PixVerse 特效 | PixVerse 凭证 |
| `src/video/providers/BaseArkProvider.ts` | — | Base Ark | Base Ark 凭证 |
| `src/video/providers/MaxApiClient.ts` | — | 共享 MaxAPI 客户端工具 | — |

### 3.2 模型配置 & 定价

**源文件：** `src/video/config/video-models.ts`

| 模型系列 | Model IDs | Credits/秒 | 最大时长 | 分辨率 | 音频 |
|---------|-----------|-----------|---------|--------|------|
| Veo3 | veo3-text-to-video, veo3-image-to-video, veo3-reference-to-video | 2.5 (text/img), 5.5 (ref) | 8s | 1080p | — |
| Sora 2 | sora-2-text-to-video, sora-2-image-to-video | 2 | 15s | 720p | — |
| Sora 2 Pro | sora-2-pro-text-to-video, sora-2-pro-image-to-video | 7 | 15s | 1080p | — |
| Seedance 1.0 | seedance-1.0-pro-text/image/reference | 2 | 12s | 480p-1080p | — |
| Seedance 1.5 | seedance-1.5-pro-text/image | 3 (+3 音频) | 12s | 720p | 可选 |
| Seedance 2.0 | seedance-2.0-text/image | 4 | 15s | 720p | 内含 |
| Seedance 2.0 Fast | seedance-2.0-fast-text/image | 3 | 15s | 720p | 内含 |
| Wan 2.2 | wan22-text-to-video, wan22-kf2v | 2-3 (按分辨率) | 5s | 480p/1080p | — |
| Wan 2.6 | wan26-text-to-video, wan26-image-to-video | 3-5 (按分辨率) | 15s | 720p/1080p | 可选 |

**Credit 计算：** `src/video/credits.ts`
- 公式：`duration × perSecondCredits + (hasAudio ? duration × audioPremiumCredits : 0)`

### 3.3 API Routes

| 源路径 | 方法 | 说明 |
|--------|------|------|
| `src/app/api/video-generation/submit/route.ts` | POST | 提交视频生成 |
| `src/app/api/video-generation/status/route.ts` | POST | 轮询状态（3s→5s→15s） |
| `src/app/api/video-generation/optimize-prompt/route.ts` | POST | AI Prompt 优化 |
| `src/app/api/video-generation/webhook/route.ts` | POST | 通用 Webhook（Kie/BytePlus/FAL/Ali） |
| `src/app/api/video-generation/webhook/[channel]/route.ts` | POST | 按 channel 分发的 Webhook |

### 3.4 Prompt 优化

- `src/video/config/prompts/video-optimization.ts` — text-to-video / image-to-video 两种模式
- `src/video/services/prompt-optimization.ts` — 服务函数（30s 超时，失败回退原始 prompt）
- 使用 Gemini 3 Flash，输出 90-170 词英文 prompt

---

## 四、Channel Router（多 Provider 路由系统）

**源文件：**
- `src/lib/channel-router.ts` — 路由核心
- `src/actions/channel-config.ts` — Admin CRUD Actions
- DB 表：`channelConfig`

**路由优先级：** `family:version:type` > `family:type` > `DEFAULT_CHANNELS`

**默认路由：**
```
veo3        → maxapi
nano-banana → maxapi
sora2       → kie
seedance:2.0 → maxapi
seedance    → byteplus
wan:2.2     → ali
wan:2.6     → ali
```

**需要迁移：**
- channelConfig 数据库表 schema
- channel-router.ts（内存缓存 + DB 查询）
- Admin 管理界面（channel-config actions）

---

## 五、PayPal 支付系统

### 5.1 后端

| 源文件 | 说明 |
|--------|------|
| `src/payment/provider/paypal.ts` (1137 行) | PayPal 支付 Provider（OAuth2、订阅、单次支付、Webhook 处理） |
| `src/payment/types.ts` | 支付类型定义（新增 PayPal 相关枚举） |
| `src/payment/index.ts` | Provider 工厂（需扩展支持 PayPal） |
| `src/app/api/paypal/create-order/route.ts` | 创建 PayPal 订单（一次性支付） |
| `src/app/api/paypal/capture-order/route.ts` | 捕获已批准订单 |
| `src/app/api/paypal/create-subscription/route.ts` | 创建 PayPal 订阅 |
| `src/app/api/paypal/confirm-subscription/route.ts` | 确认订阅激活 |
| `src/app/api/webhooks/paypal/route.ts` | PayPal Webhook 端点 |

### 5.2 前端

| 源文件 | 说明 |
|--------|------|
| `src/components/pricing/payment-checkout-dialog.tsx` (661 行) | 双支付方式对话框（Stripe + PayPal） |

**依赖包：**
- `@paypal/react-paypal-js` (v8.9.2)
- `@paypal/paypal-js` (v9.2.0)

### 5.3 数据库变更

payment 表需新增字段：
```sql
provider         TEXT DEFAULT 'stripe'    -- 'stripe' | 'paypal'
paypal_subscription_id  TEXT
paypal_order_id         TEXT
```

### 5.4 Webhook 事件处理

| 事件 | 动作 |
|------|------|
| `PAYMENT.CAPTURE.COMPLETED` | 记录一次性支付，发放积分/终身权益 |
| `BILLING.SUBSCRIPTION.ACTIVATED` | 记录订阅，发放订阅积分 |
| `BILLING.SUBSCRIPTION.CANCELLED/SUSPENDED/EXPIRED` | 标记取消 |
| `PAYMENT.SALE.COMPLETED` | 订阅续费，发放续费积分 |

### 5.5 环境变量

```
NEXT_PUBLIC_PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_WEBHOOK_ID=
```

---

## 六、Google One Tap 登录

### 6.1 需要迁移的文件

| 源文件 | 说明 |
|--------|------|
| `src/components/auth/google-one-tap.tsx` | One Tap 组件（检测 session → 延迟 1.2s 弹出） |
| `src/lib/auth-client.ts` | 需添加 `oneTapClient()` 插件配置 |
| `src/lib/auth.ts` | 需添加 `oneTap()` 服务端插件 |
| `src/components/layout/global-dialogs.tsx` | One Tap 渲染位置（排除 home/settings/admin 等页面） |
| `src/app/auth-callback/route.ts` | OAuth 弹窗回调（BroadcastChannel + localStorage + Polling 三通道通信） |
| `src/stores/oauth-coordination-store.ts` | OAuth 状态协调 store |
| `src/hooks/use-popup-oauth.ts` | 弹窗式 OAuth 流程管理 |
| `src/lib/auth/constants.ts` | COOP、popup、nonce 常量 |

### 6.2 配置变更

mksaas 已有 Google OAuth，需额外：
1. Better Auth 服务端添加 `oneTap()` 插件
2. Auth client 添加 `oneTapClient({ clientId })` 
3. 环境变量：`NEXT_PUBLIC_GOOGLE_CLIENT_ID`（已有但需确认公开版本）
4. 在 `websiteConfig` 添加 `enableGoogleOneTap` 功能开关

---

## 七、数据库 Schema 变更

### 7.1 新增表

**asset 表（统一图片/视频资产）：**
```
id, userId, type (image|video), status (PENDING→IN_QUEUE→IN_PROGRESS→COMPLETED→SAVED_TO_R2→FAILED),
prompt, negativePrompt, modelId, mode (text-to-image|image-to-video 等),
aspectRatio, resolution, durationSeconds, hasAudio, outputFormat,
creditsUsed, inputImageUrls[], inputImageRoles[],
outputImageUrls[], outputImageUrlsR2[], outputVideoUrl, outputVideoUrlR2,
channel, providerRequestId, errorMessage, metadata (JSONB), logs (JSONB), metrics (JSONB),
isFavorite, isDelete, createdAt, updatedAt
```

**channelConfig 表（Provider 路由配置）：**
```
id, modelFamily, modelType, modelVersion, channel, apiModelId, priority, enabled, createdAt, updatedAt
```

**effectConfig 表（视频特效模板）：**
```
id, slug, displayName, pricing, enabled, ...
```

**userEntitlement 表（权益系统）：**
```
id, userId, scope, source, expiresAt, createdAt
```

**dailyCheckin 表：**
```
id, userId, checkinDate, streakCount, rewardCredits, createdAt
```

### 7.2 修改表

**payment 表新增字段：**
- `provider` (stripe | paypal)
- `paypalSubscriptionId`
- `paypalOrderId`
- `scene` (lifetime | credit | subscription)
- `trialStart`, `trialEnd`

---

## 八、状态管理 & Hooks

### 8.1 Stores（Zustand）

| 源文件 | 说明 | mksaas 现状 |
|--------|------|------------|
| `src/stores/generate-form-store.ts` | 生成表单（模型、参数、上传图片） | 无，需新增 |
| `src/stores/image-generation-store.ts` | 生成状态（idle→submitting→polling→done） | 无，需新增 |
| `src/stores/app-page-store.ts` | App 工作区状态（面板、过滤、pending 任务） | 无，需新增 |
| `src/stores/insufficient-credits-dialog-store.ts` | 积分不足对话框 | 无，需新增 |
| `src/stores/daily-checkin-dialog-store.ts` | 签到对话框 | 无，需新增 |
| `src/stores/subscription-required-dialog-store.ts` | 订阅引导对话框 | 无，需新增 |
| `src/stores/oauth-coordination-store.ts` | OAuth 弹窗协调 | 无，需新增 |

### 8.2 Hooks

| 源文件 | 说明 | mksaas 现状 |
|--------|------|------------|
| `src/hooks/use-image-generation.ts` | 图片提交+轮询（2s→4s→10s，20min 超时） | 有基础版，需替换 |
| `src/hooks/use-video-generation.ts` | 视频提交+轮询（3s→5s→15s，30min 超时） | 无，需新增 |
| `src/hooks/use-multi-generation.ts` | 多任务并行管理 | 无，需新增 |
| `src/hooks/use-pending-generation.ts` | 跳转后自动提交 | 无，需新增 |
| `src/hooks/use-credits-check.ts` | 积分预检（触发不足对话框） | 无，需新增 |
| `src/hooks/use-daily-checkin.ts` | 签到查询+领取 | 无，需新增 |
| `src/hooks/use-checkin-after-auth.ts` | 登录后自动签到 | 无，需新增 |
| `src/hooks/use-app-feed.ts` | 分页无限滚动 Feed | 无，需新增 |
| `src/hooks/use-asset-favorites.ts` | 收藏切换 | 无，需新增 |
| `src/hooks/use-popup-oauth.ts` | 弹窗 OAuth 管理 | 无，需新增 |

---

## 九、NSFW 检测 & 内容安全（完整链路）

### 9.1 后端检测 & 路由

| 源文件 | 说明 |
|--------|------|
| `src/lib/nsfw/detect.ts` | OpenAI Moderation API 检测（文本+图片，支持多图并行） |
| `src/lib/nsfw/routing.ts` | 检测结果路由决策：`pass` / `fallback` / `block` |
| `src/lib/nsfw/config.ts` | Fallback 模型映射（视频→Wan2.6，图片无 fallback） |
| `src/lib/nsfw/user-tier.ts` | 付费用户判定（排除免费/赠送积分） |
| `src/lib/nsfw/param-mapping.ts` | Fallback 模型参数兼容映射（分辨率、宽高比、时长、音频） |
| `src/lib/nsfw/provider-error.ts` | Provider 审核错误识别（匹配 15+ 关键词） |
| `src/lib/nsfw/types.ts` | 类型定义 |
| `src/lib/nsfw/index.ts` | 导出 |

### 9.2 前端拦截弹窗（关键遗漏项 ✅ 已补充）

| 源文件 | 说明 |
|--------|------|
| `src/components/pricing/nsfw-upgrade-dialog.tsx` | **NSFW 拦截升级对话框**（两种变体：`blocked` 硬拦截 / `moderation` Provider 审核拒绝） |
| `src/stores/app-page-store.ts` → `moderationDialog` | Store 中的 `moderationDialog: 'blocked' \| 'moderation' \| null` 状态 |
| `src/components/app/app-page-client.tsx` | 渲染 NsfwUpgradeDialog，订阅 store 状态 |

### 9.3 前端错误处理链路

NSFW 错误在 **3 个环节** 被捕获并触发弹窗：

| 环节 | Hook / 文件 | 错误码 | 说明 |
|------|------------|--------|------|
| 提交时 403 | `use-image-generation.ts` / `use-video-generation.ts` | `NSFW_BLOCKED` | API 返回 403，throw 带 code 的 Error |
| 自动提交时 | `use-pending-generation.ts` | `NSFW_BLOCKED` / `CONTENT_MODERATION` | 跳转后自动提交的错误处理 |
| 轮询时 | `use-multi-generation.ts` | `NSFW_BLOCKED` / `CONTENT_MODERATION` | 生成过程中 Provider 审核拒绝 |

**流程：** 错误码 → `setModerationDialog('blocked' | 'moderation')` → `NsfwUpgradeDialog` 弹出 → 展示升级引导 + 内嵌支付

### 9.4 后端集成点

| API Route | NSFW 处理方式 |
|-----------|-------------|
| `image-generation/submit` | `detectNsfw()` → 免费用户拦截，付费用户放行 |
| `video-generation/submit` | `checkAndRouteNsfw()` → 免费拦截，付费 fallback 到 Wan2.6 + 参数映射 |
| `video-generation/submit` (catch) | `isProviderModerationError()` → Provider 返回审核错误时返回 403 |

---

## 十、Watermark 水印

| 源文件 | 说明 |
|--------|------|
| `src/lib/watermark.ts` (60 行) | 水印逻辑：检测是否需要（无付费记录=需要）+ Sharp SVG 叠加 |
| `src/components/watermark-overlay.tsx` | 预览水印 UI 组件 |

---

## 十一、Entitlements 权益系统

| 源文件 | 说明 |
|--------|------|
| `src/lib/entitlements/entitlements.ts` | 权益核心检查（scope + 过期时间） |
| `src/lib/entitlements/fair-use.ts` | 公平使用策略（按日/月限额） |
| `src/lib/entitlements/nano-family.ts` | Nano 模型家族权益（免费用户配额管理） |
| `src/lib/entitlements/constants.ts` | 权益常量（scope, type, status, source） |
| DB 表 `userEntitlement` | scope, source, expiresAt |

**用途：** Nano 家族免费用户限额（按日/月/分辨率），付费用户无限制

---

## 十二、每日签到系统

| 源文件 | 说明 |
|--------|------|
| `src/lib/checkin/checkin-service.ts` | 签到服务（连续天数追踪、奖励领取） |
| `src/lib/checkin/checkin-logic.ts` | 签到逻辑 |
| `src/lib/checkin/checkin-date.ts` | 日期工具 |
| `src/lib/checkin/constants.ts` | 签到常量（最大领取次数、奖励配置） |
| `src/actions/claim-daily-checkin.ts` | 签到 Action（7 天连续奖励） |
| `src/actions/get-daily-checkin-status.ts` | 查询今日签到状态 |
| `src/hooks/use-daily-checkin.ts` | 签到 hook（查询+领取+analytics） |
| `src/hooks/use-checkin-after-auth.ts` | 登录后自动签到 |
| `src/hooks/use-auto-checkin-after-login.ts` | 自动触发签到 |
| `src/stores/daily-checkin-dialog-store.ts` | 签到对话框状态 |

---

## 十三、Storage 存储

mksaas 已有 S3/R2 存储基础设施，但需要迁移：

| 源文件 | 说明 |
|--------|------|
| `src/app/api/storage/download/route.ts` | 下载端点（image-website 独有） |
| `src/app/api/download/route.ts` | 资产下载（带权限检查） |

---

## 十四、反滥用系统

### 14.1 设备指纹

| 源文件 | 说明 |
|--------|------|
| `src/lib/fingerprint.ts` | 设备指纹检测（限制同一设备 3+ 账号） |
| `src/components/auth/fingerprint-saver.tsx` | 客户端指纹采集组件 |
| `src/actions/save-fingerprint.ts` | 持久化指纹到 DB |
| `src/hooks/use-fingerprint.ts` | 指纹 React hook |

**DB 变更：** user 表新增 `deviceFingerprint` 字段 + 索引

### 14.2 邮箱验证 & 反薅羊毛

| 源文件 | 说明 |
|--------|------|
| `src/lib/email-validation.ts` | 邮箱综合验证（50+ 一次性邮箱域名黑名单、Gmail 别名检测、过度点号检测、Gmail 标准化） |
| `src/actions/validate-registration.ts` | 注册验证逻辑 |
| `src/actions/validate-captcha.ts` | CAPTCHA 验证 |

---

## 十五、通知系统（Discord / 飞书）

| 源文件 | 说明 |
|--------|------|
| `src/notification/notification.ts` | 通知调度器（统一入口） |
| `src/notification/discord.ts` | Discord Webhook（支付提醒） |
| `src/notification/feishu.ts` | 飞书群聊 Webhook（支付提醒） |

**触发时机：** 支付成功、订阅激活、大额订单等

---

## 十六、Video Effects 特效系统（PixVerse）

| 源文件 | 说明 |
|--------|------|
| `src/video/config/pixverse.ts` | PixVerse API 配置 |
| `src/video/providers/PixVerseProvider.ts` | PixVerse Provider 实现 |
| `src/app/api/video-effects/pixverse/generate/route.ts` | 特效生成端点 |
| `src/app/api/video-effects/pixverse/upload/route.ts` | 图片上传端点 |
| `src/app/api/video-effects/pixverse/status/route.ts` | 任务状态端点 |
| `src/video/data/effect-config.ts` | 特效配置数据 |
| `src/effect/config/effects.ts` | 特效定义 |
| DB 表 `effectConfig` | 特效模板（slug, 定价, SEO, PixVerse 配置） |

---

## 十七、Admin 管理面板扩展

mksaas 已有基础 admin，需新增以下页面和 actions：

| 源文件 | 说明 |
|--------|------|
| `src/app/[locale]/(protected)/admin/generations/page.tsx` | 生成记录管理 |
| `src/app/[locale]/(protected)/admin/channels/page.tsx` | Channel 路由配置管理 |
| `src/app/[locale]/(protected)/admin/payments/page.tsx` | 支付记录管理 |
| `src/app/[locale]/(protected)/admin/users/[userId]/credits/page.tsx` | 用户积分管理 |
| `src/actions/admin-gift-credits.ts` | 赠送积分 |
| `src/actions/admin-grant-pro.ts` | 授予 Pro 权限 |
| `src/actions/admin-revoke-pro.ts` | 撤销 Pro 权限 |
| `src/actions/get-generations.ts` | 查询生成记录（过滤+分页） |
| `src/actions/get-payment-stats.ts` | 支付统计 |

---

## 十八、Asset 管理模块

| 源文件 | 说明 |
|--------|------|
| `src/assets/data/asset.ts` | Asset CRUD 操作（create, update, get, list, soft-delete） |
| `src/assets/business/asset-mapper.ts` | Asset 数据映射（DB→前端） |
| `src/assets/business/asset-pagination.ts` | Asset 分页逻辑 |
| `src/assets/types.ts` | Asset 类型定义 |
| `src/app/api/assets/route.ts` | Asset 列表 API |
| `src/app/api/assets/[id]/route.ts` | 单个 Asset API |
| `src/app/api/assets/favorites/route.ts` | 收藏切换 API |
| `src/app/api/download/route.ts` | 资产下载（带权限 + URL 白名单验证） |

---

## 十九、付费用户欢迎邮件

| 源文件 | 说明 |
|--------|------|
| `src/mail/templates/paid-user-welcome.tsx` | 付费用户欢迎邮件模板 |
| `src/mail/welcome-email.ts` | 欢迎邮件发送服务 |

**触发时机：** PayPal/Stripe 支付成功后发送

---

## 二十、Credit 分发定时任务

| 源文件 | 说明 |
|--------|------|
| `src/app/api/distribute-credits/route.ts` | 每日积分分发 API（Basic Auth 保护） |
| `src/credits/distribute.ts` | 分发逻辑（批量处理，N+1 优化） |

**用途：** 按计划给所有用户分发每月免费积分

---

## 二十一、Dashboard 工作区 + Gallery 系统

### 21.1 核心工作区

| 源文件 | 说明 |
|--------|------|
| `src/components/dashboard/ai-workspace.tsx` | **主生成工作区**（核心界面，组合 sidebar + 表单 + gallery） |
| `src/components/dashboard/dashboard-header.tsx` | 工作区头部 |
| `src/components/dashboard/dashboard-sidebar.tsx` | 工作区侧边栏导航 |
| `src/components/dashboard/sidebar-main.tsx` | 侧边栏主内容 |
| `src/components/dashboard/sidebar-models.tsx` | 模型选择侧边栏 |
| `src/components/dashboard/sidebar-upgrade-button.tsx` | 侧边栏升级提示 |
| `src/components/dashboard/sidebar-user.tsx` | 侧边栏用户信息 |
| `src/components/dashboard/prompt-optimizer.tsx` | AI Prompt 增强组件 |
| `src/components/dashboard/image-generation-result.tsx` | 生成结果展示 |

### 21.2 Gallery 画廊系统

| 源文件 | 说明 |
|--------|------|
| `src/components/dashboard/gallery/index.tsx` | Gallery 容器 |
| `src/components/dashboard/gallery/masonry-gallery.tsx` | 瀑布流布局画廊 |
| `src/components/dashboard/gallery/gallery-item.tsx` | 单个画廊项 |
| `src/components/dashboard/gallery/active-generation.tsx` | 正在生成中的项显示 |
| `src/components/dashboard/gallery/empty-state.tsx` | 空状态 |
| `src/components/dashboard/gallery/video-modal.tsx` | 视频播放弹窗 |
| `src/components/dashboard/gallery/types.ts` | Gallery 类型定义 |

**依赖包：** `react-masonry-css` (瀑布流布局)

---

## 二十二、生成表单面板组件

| 源文件 | 说明 |
|--------|------|
| `src/components/app/panel-form-image.tsx` (318 行) | 图片生成表单（模型选择、宽高比、分辨率、积分显示） |
| `src/components/app/panel-form-video.tsx` (568 行) | 视频生成表单（模型、宽高比、时长、分辨率、音频开关） |
| `src/components/app/panel-form-effect.tsx` (353 行) | 特效表单（特效参数） |
| `src/components/app/image-upload-area.tsx` (193 行) | 拖放图片上传区 |
| `src/components/app/panel-image-upload.tsx` (364 行) | 图片上传面板（首帧/末帧/参考图） |
| `src/components/app/compact-image-input.tsx` (235 行) | 紧凑型图片输入 |
| `src/components/app/app-floating-bar.tsx` (348 行) | 浮动操作栏（折叠/展开式快速生成） |
| `src/components/app/result-feed.tsx` (444 行) | 结果 Feed（无限滚动、过滤、排序） |
| `src/components/app/result-card.tsx` (228 行) | 结果卡片（缩略图、元数据、下载/分享/收藏） |
| `src/components/app/result-card-loading.tsx` | 加载骨架屏 |
| `src/components/app/empty-showcase.tsx` | 空状态展示 |

---

## 二十三、全局对话框调度系统

| 源文件 | 说明 |
|--------|------|
| `src/components/layout/global-dialogs.tsx` | **对话框调度中心**（集中渲染所有全局弹窗：积分不足、订阅引导、签到、Google One Tap） |

**调度的对话框：**
- `InsufficientCreditsDialog` ← `insufficient-credits-dialog-store`
- `SubscriptionRequiredDialog` ← `subscription-required-dialog-store`
- `DailyCheckinDialog` ← `daily-checkin-dialog-store`
- `GoogleOneTap` ← 条件渲染（未登录 + 特定页面）
- `NsfwUpgradeDialog` ← `app-page-store.moderationDialog`

---

## 二十四、定价对话框体系

| 源文件 | 说明 |
|--------|------|
| `src/components/pricing/payment-checkout-dialog.tsx` (661 行) | 主结账对话框（Stripe + PayPal 双通道） |
| `src/components/pricing/credit-packs-dialog.tsx` | 积分包购买对话框 |
| `src/components/pricing/subscription-required-dialog.tsx` | 订阅引导对话框 |
| `src/components/pricing/upgrade-dialog.tsx` | 统一升级对话框 |
| `src/components/pricing/upgrade-dialog-features-panel.tsx` | 升级弹窗功能面板 |
| `src/components/pricing/upgrade-dialog-pricing-panel.tsx` | 升级弹窗定价面板 |
| `src/components/pricing/nsfw-upgrade-dialog.tsx` | NSFW 拦截升级对话框 |
| `src/components/pricing/checkout-utils.ts` | 结账工具函数 |
| `src/components/pricing/payment-methods.tsx` | 支付方式选择组件 |
| `src/components/pricing/create-checkout-button.tsx` | 通用结账按钮 |
| `src/components/pricing/customer-portal-button.tsx` | Stripe 客户门户按钮 |

---

## 二十五、Premium 权限守卫 & 访问检查

| 源文件 | 说明 |
|--------|------|
| `src/components/premium/premium-badge.tsx` | Premium 标识徽章 |
| `src/components/premium/premium-content.tsx` | Premium 内容包装器 |
| `src/components/premium/premium-guard.tsx` | 非 Premium 用户拦截组件 |
| `src/lib/premium-access.ts` | Premium 访问检查（终身计划、订阅、admin-granted Pro） |

---

## 二十六、积分余额 UI

| 源文件 | 说明 |
|--------|------|
| `src/components/layout/credits-balance-button.tsx` | 导航栏积分余额按钮 |
| `src/components/layout/credits-balance-menu.tsx` | 积分下拉菜单（余额、购买入口） |

---

## 二十七、Settings 用户设置页面

| 源文件 | 说明 |
|--------|------|
| `src/components/settings/billing/billing-card.tsx` | 账单信息卡片 |
| `src/components/settings/credits/credits-page-client.tsx` | 积分设置页面 |
| `src/components/settings/credits/credits-card.tsx` | 积分概览卡片 |
| `src/components/settings/credits/credit-packages.tsx` | 可购买积分包 |
| `src/components/settings/credits/credit-checkout-button.tsx` | 积分购买按钮 |
| `src/components/settings/credits/credit-transactions.tsx` | 交易记录 |
| `src/components/settings/credits/credit-transactions-table.tsx` | 交易记录表格 |
| `src/components/settings/credits/credit-detail-viewer.tsx` | 积分详情查看器 |
| `src/components/settings/profile/update-name-card.tsx` | 修改姓名 |
| `src/components/settings/profile/update-avatar-card.tsx` | 修改头像 |
| `src/components/settings/security/update-password-card.tsx` | 修改密码 |
| `src/components/settings/security/reset-password-card.tsx` | 重置密码 |
| `src/components/settings/security/password-card-wrapper.tsx` | 密码卡片包装器 |
| `src/components/settings/security/delete-account-card.tsx` | 删除账号 |
| `src/components/settings/notification/newsletter-form-card.tsx` | 邮件订阅表单 |

---

## 二十八、签到 UI 组件

| 源文件 | 说明 |
|--------|------|
| `src/components/checkin/daily-checkin-dialog.tsx` | 签到对话框（被 global-dialogs 渲染） |
| `src/components/checkin/daily-checkin-card.tsx` | 签到卡片 |
| `src/components/checkin/checkin-reward-grid.tsx` | 7 天奖励网格展示 |

---

## 二十九、Asset 浏览页面组件

| 源文件 | 说明 |
|--------|------|
| `src/components/assets/assets-page-client.tsx` | Asset 页面客户端组件 |
| `src/components/assets/asset-grid.tsx` | Asset 网格布局 |
| `src/components/assets/asset-card.tsx` | Asset 卡片 |
| `src/components/assets/asset-actions.tsx` | Asset 操作菜单（删除、编辑等） |
| `src/components/assets/asset-favorite-button.tsx` | 收藏按钮 |
| `src/components/assets/asset-filters.tsx` | Asset 过滤控件 |
| `src/components/assets/asset-preview-modal.tsx` | Asset 预览弹窗 |
| `src/components/assets/asset-delete-dialog.tsx` | 删除确认对话框 |
| `src/components/assets/asset-empty-state.tsx` | 空状态 |

---

## 三十、CAPTCHA 验证

| 源文件 | 说明 |
|--------|------|
| `src/lib/captcha.ts` | Cloudflare Turnstile 服务端验证 |
| `src/components/shared/captcha.tsx` | CAPTCHA 前端组件 |

---

## 三十一、Stripe 嵌入式结账

mksaas 已有 Stripe SDK，但缺少 React 组件层：

| 源文件 | 说明 |
|--------|------|
| `src/app/api/stripe/create-embedded-checkout/route.ts` | Stripe 嵌入式结账 API |

**依赖包：** `@stripe/react-stripe-js` (v5.4.1)

---

## 三十二、其他工具函数

| 源文件 | 说明 |
|--------|------|
| `src/lib/premium-access.ts` | Premium 访问检查（终身/订阅/admin-granted） |
| `src/lib/price-plan.ts` | Plan 查找工具（findPlanByPriceId, findCreditsByPriceId 等） |
| `src/lib/constants.ts` | 应用常量（文件大小限制、积分过期时间、轮询间隔等） |
| `src/lib/formatter.ts` | 价格和日期格式化工具 |
| `src/video/model-family.ts` | 视频模型家族类型定义 |
| `src/config/sidebar-models-config.ts` | 模型侧边栏配置 |

---

## 三十三、环境变量清单（新增）

```bash
# === PayPal ===
NEXT_PUBLIC_PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_WEBHOOK_ID=
ALLOW_UNVERIFIED_PAYPAL_WEBHOOKS=  # 开发环境跳过签名验证

# === Google One Tap ===
NEXT_PUBLIC_GOOGLE_CLIENT_ID=
NEXT_PUBLIC_ENABLE_GOOGLE_ONE_TAP=true

# === 生成 Providers ===
KIE_AI_API_KEY=
MAXAPI_API_KEY=
BYTEPLUS_API_KEY=
VOLCANO_API_KEY=
ALI_API_KEY=
APICORE_API_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=
GOOGLE_VERTEX_PROJECT=
GOOGLE_VERTEX_LOCATION=
GOOGLE_APPLICATION_CREDENTIALS=

# === NSFW ===
OPENAI_API_KEY=  # 已有，用于 Moderation API

# === 通知 ===
DISCORD_WEBHOOK_URL=
FEISHU_WEBHOOK_URL=

# === PixVerse 特效 ===
PIXVERSE_API_KEY=

# === Storage (已有，确认配置) ===
STORAGE_REGION=
STORAGE_ENDPOINT=
STORAGE_ACCESS_KEY_ID=
STORAGE_SECRET_ACCESS_KEY=
STORAGE_BUCKET_NAME=
STORAGE_PUBLIC_URL=
```

---

## 三十四、NPM 依赖（新增）

```json
{
  "@paypal/react-paypal-js": "^8.9.2",
  "@paypal/paypal-js": "^9.2.0",
  "@stripe/react-stripe-js": "^5.4.1",
  "@fal-ai/client": "^1.8.1",
  "@google-cloud/storage": "^7.18.0",
  "@google/genai": "^1.34.0",
  "google-auth-library": "^10.5.0",
  "sharp": "^0.34.5",
  "@fingerprintjs/fingerprintjs": "^5.0.1",
  "mailchecker": "^6.0.19",
  "react-masonry-css": "^1.0.16",
  "embla-carousel-autoplay": "^8.6.0"
}
```

---

## 三十五、建议迁移顺序

### Phase 1：核心生成链路（打通 MVP）
1. 新增 `asset` + `channelConfig` 表 schema + migration
2. 迁移图片 Providers + factory + 模型配置
3. 迁移视频 Providers + factory + 模型配置
4. 迁移 image-generation / video-generation API routes（submit + status）
5. 迁移 generate-form-store + image-generation-store + app-page-store
6. 迁移 use-image-generation + use-video-generation hooks
7. 迁移生成表单面板组件（panel-form-image/video, image-upload-area 等）
8. 迁移 Asset CRUD + mapper + 分页
9. 对接现有 Hero UI 组件

### Phase 2：Dashboard 工作区
10. 迁移 ai-workspace + dashboard 布局（sidebar, header）
11. 迁移 Gallery 画廊系统（masonry-gallery, gallery-item, active-generation, video-modal）
12. 迁移 result-feed + result-card + app-floating-bar
13. 迁移 App Feed hook + multi-generation + pending-generation
14. 迁移 Asset 浏览页面组件（asset-grid, asset-card, asset-preview-modal 等）
15. 迁移 global-dialogs 调度中心

### Phase 3：支付 & 认证
16. 迁移 PayPal Provider + API routes + Webhook
17. 迁移定价对话框体系（payment-checkout-dialog, credit-packs-dialog, upgrade-dialog 等）
18. 迁移 Stripe 嵌入式结账（@stripe/react-stripe-js）
19. payment 表 schema 变更（新增 PayPal 字段）
20. 迁移 Google One Tap（插件 + 组件 + 回调 + OAuth 弹窗系统）
21. 迁移积分余额 UI（credits-balance-button + menu）
22. 迁移付费用户欢迎邮件
23. 迁移 Premium 权限守卫 + premium-access.ts

### Phase 4：完善生产级功能
24. 迁移 Channel Router + channelConfig 管理
25. 迁移 NSFW 完整链路（detect → routing → user-tier → param-mapping → provider-error → nsfw-upgrade-dialog → store moderationDialog → hooks 错误处理）
26. 迁移 Watermark 水印
27. 迁移 Prompt 优化（image + video）
28. 迁移 Webhook 回调处理（Kie/BytePlus/FAL/Ali/MaxAPI）
29. 迁移 Entitlements 权益系统（含 fair-use + nano-family）
30. 迁移通知系统（Discord / 飞书 Webhook）

### Phase 5：用户体验 & 安全
31. 迁移每日签到系统（checkin-service + UI 组件）
32. 迁移积分不足 / 订阅引导对话框
33. 迁移反滥用系统（设备指纹 + 邮箱验证 + CAPTCHA）
34. 迁移 Credit 分发定时任务
35. 迁移 Settings 用户设置页面（billing, credits, profile, security）

### Phase 6：扩展功能（可选）
36. 迁移 Video Effects 特效系统（PixVerse）
37. 迁移 Admin 管理面板扩展（生成记录 / Channel 管理 / 支付统计）
38. 迁移工具函数（premium-access, price-plan, constants, formatter, model-family）

---

## 三十六、不需要迁移的模块

| 模块 | 原因 |
|------|------|
| 用户认证核心 | mksaas 已有 Better Auth（email/password + GitHub + Google） |
| Stripe 支付核心 | mksaas 已有完整 Stripe 集成 |
| Credits 基础系统 | mksaas 已有 addCredits / consumeCredits / FIFO 消费 |
| S3/R2 存储基础 | mksaas 已有 s3mini + upload route |
| 数据库连接 | mksaas 已有 Drizzle + PostgreSQL |
| i18n 框架 | mksaas 已有 next-intl（EN/ZH/JA） |
| Hero UI 组件 | mksaas 已有自己的 operation-panel / preview-panel |
| Blog / Docs | mksaas 已有 MDX + Fumadocs |
