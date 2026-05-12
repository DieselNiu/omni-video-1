# 首页免费生成额度系统 — 设计方案 v2

> 版本：v2（已整合 v1 + 专家勘误的 6 条修正）
> 范围：仅首页 image hero 区域的 nano-banana text-to-image 路径
> 不影响：现有 `userCredit` / `creditTransaction` 付费体系；`/app` dashboard 的完整生成流程

---

## 变更概览（相对 v1）

| # | 修正点 | 来源 |
|---|---|---|
| MF1 | 不修改 `/api/image-generation/submit`；新建首页专用路由组 `/api/home/image/*` | 专家勘误 |
| MF2 | `claim-guest` 不得重置已存在的 user bucket，`INSERT ... ON CONFLICT DO NOTHING` 精确表达 | 专家勘误 |
| MF3 | 付费分流判断扩展为「有无现有付费能力」（涵盖 credits + entitlement + fair-use） | 专家勘误 |
| SA1 | 匿名 recent 查询加 `AND userId IS NULL`，防共享设备隐私串号 | 专家勘误 |
| SA2 | 并发限制抽成 `checkConcurrency(subjectType, subjectId)` helper，按 subject 分表查 | 专家勘误 |
| SA3 | 指纹采集失败时的降级策略：capacity=3 + IP+UA 严格限流 | 专家勘误 |

---

## 1. 产品目标

| 场景 | 行为 |
|---|---|
| 匿名首次进入 | 直接生成，累计 5 次（永久上限，不自动刷新） |
| 匿名第 6 次点 Generate | 弹登录弹窗（image 2），保留当前 prompt 参数 |
| 登录成功 | 首次创建 user bucket：发 5 次初始额度，10 分钟冷却策略生效；自动续跑被拦下的那次生成 |
| 登录态连续用完 5 次 | 弹倒计时弹窗（image 3）；`remaining=0` 那一刻起 10 分钟后恢复满 5 次 |
| 登录态稀疏使用 | 不惩罚；只有 `remaining=0` 才写 `nextRefillAt` |
| 登录态有付费能力 | 走现有付费链路（credits / entitlement / fair-use），不触发免费额度 |
| 匿名请求非 nano-banana 或非 text-to-image 或批量/多图 | 403 `FEATURE_REQUIRES_LOGIN` |

---

## 2. 核心决策摘要

| # | 决策 | 结论 |
|---|---|---|
| 1 | Free quota 是否进 credits 体系 | 否，独立系统 |
| 2 | 匿名 5 次是否刷新 | 否，永久上限 |
| 3 | 登录态 quota 模型 | 耗尽触发冷却（`remaining→0` 写 `nextRefillAt`） |
| 4 | 匿名 Recent Generations 存储 | 服务端 `guest_generation` 为真，localStorage 仅缓存 |
| 5 | 是否复用 `asset` 表 | 否，新建 `guest_generation` 隔离语义 |
| 6 | 匿名主体 ID | `guest_id` 主体 + `fingerprintHash` 反薅绑定；查 bucket 先指纹再 guest_id |
| 7 | 覆盖模型范围 | 仅 nano-banana + text-to-image |
| 8 | Turnstile | 暂不接入 |
| 9 | `guest_generation` 保留期 | 7 天（未 claim 的匿名行）；已 claim 保留不 GC |
| 10 | 指纹撞已登录用户时 | 允许登录，但不发放新的免费 quota（`withheld=true`） |
| 11 | Claim 方式 | in-place 更新 `guest_generation.userId`，不迁移到 `asset` |
| 12 | 匿名耗尽后按钮态 | 置灰；点击重开登录弹窗（不自动弹） |
| 13 | 指纹 bucket 并发建重 | `UNIQUE(fingerprintHash)` + `ON CONFLICT DO NOTHING` |
| 14 | **路由隔离** | **首页用 `/api/home/image/*` 独立一组，不动 `/api/image-generation/*`** |
| 15 | **Claim 对已有 bucket 的处理** | **`INSERT ... ON CONFLICT DO NOTHING`，已有则完全不动** |
| 16 | **付费能力判断** | **credits / entitlement / fair-use 任一命中即走现有链路** |
| 17 | **匿名 recent 查询** | **`WHERE guestId=? AND userId IS NULL`** |
| 18 | **并发限制** | **`checkConcurrency(subjectType, subjectId)` helper，按表分流** |
| 19 | **指纹失败降级** | **capacity=3 + IP+UA 严格限流；bucket 主体仍按 `guestId` 不改表结构** |

---

## 3. 身份层

### 3.1 `guest_id`（匿名主体）

- 形式：HMAC 签名的 httpOnly cookie
- 签发时机：无 session 且无 `guest_id` cookie 的请求进入首页相关路径时，由中间件签发
- 值：`hmac(secret, uuid + issuedAt)`
- 属性：`HttpOnly; SameSite=Lax; Secure (prod); Max-Age=1 year`
- 作用：作为 `quota_bucket` 和 `guest_generation` 的主键；cookie 被清即失去历史入口

### 3.2 `fingerprintHash`（反薅绑定键）

- 采集：复用现有 [src/lib/fingerprint.ts](src/lib/fingerprint.ts) / [src/hooks/use-fingerprint.ts](src/hooks/use-fingerprint.ts)
- 采集时机：首页首屏挂载后尽早采集，随首次 quota/submit 请求 body 附带
- 后端处理：写入 `quota_bucket.fingerprintHash`，对匿名 bucket 加 `UNIQUE` 约束
- 作用：堵住「清 cookie 重领 5 次」的路径

### 3.3 指纹采集失败的降级路径（SA3）

| 指纹状态 | 初始 capacity | bucket 主键 | IP+UA 限流阈值 | 备注 |
|---|---|---|---|---|
| 正常采集 | 5 | `subjectType='guest', subjectId=guestId` + `fingerprintHash` 唯一 | 5 req/min | 正常路径 |
| 采集失败 / 空值 | 3 | 同上，`fingerprintHash=NULL`，无唯一约束兜底 | 2 req/min | 靠严限流 + 降额度削弱攻击收益 |

权衡：指纹失败时不提升 bucket 键强度（继续用 guest_id），避免 NAT 环境下不同真实用户共用 IP 被强行合并 bucket。削弱路径是**降额度 + 降限流**。前端可选加 subtle 提示「为获得完整额度，请关闭隐私插件 / 启用 JavaScript」。

### 3.4 `(IP + UA hash)` 短周期限流

- 中间件层实现；不作为身份；不进 bucket
- 正常路径：5 req/min
- 降级路径：2 req/min
- 超限 → 429 `RATE_LIMITED`

---

## 4. 数据模型

### 4.1 `guest_generation`（新表）

匿名作业记录 + 匿名 Recent Generations 来源。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid pk | |
| `guestId` | text, not null | 签名 cookie 里的匿名主体 ID |
| `fingerprintHash` | text, nullable | 用于风控归因；降级路径为空 |
| `userId` | text, nullable, FK→user | claim 后打戳 |
| `providerJobId` | text, unique | provider 侧作业 ID |
| `status` | enum | `pending` / `completed` / `failed` |
| `modelId` | text | 当前仅 `nano-banana`，保留扩展 |
| `params` | jsonb | prompt / aspect / resolution 等 |
| `resultUrl` | text, nullable | |
| `thumbnailUrl` | text, nullable | |
| `errorCode` | text, nullable | |
| `createdAt`, `updatedAt`, `completedAt` | timestamptz | |

**索引**：
- `(guestId, createdAt DESC)` — 匿名 recent 查询
- `(userId, createdAt DESC)` — claim 后查询
- `(fingerprintHash)` — 风控/分析
- `(providerJobId)` — status 回调

**GC**：定时任务 `DELETE WHERE createdAt < now() - INTERVAL '7 days' AND userId IS NULL`

### 4.2 `quota_bucket`（新表）

统一承载匿名与登录态的免费额度。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid pk | |
| `subjectType` | enum | `guest` / `user` |
| `subjectId` | text, not null | guest 时 = `guestId`；user 时 = `userId` |
| `fingerprintHash` | text, nullable | guest 且采集成功时必填 |
| `remaining` | int, default 5 | |
| `capacity` | int, default 5 | 预留调整余地（SA3 降级路径为 3） |
| `policy` | enum | `ANON_ONE_SHOT` / `USER_FREE_10MIN` |
| `nextRefillAt` | timestamptz, nullable | `remaining→0` 时由 `USER_FREE_10MIN` 写入 |
| `exhaustedAt` | timestamptz, nullable | 审计/指标 |
| `linkedUserId` | text, nullable, FK→user | claim 后 guest bucket 回填，防 logout 重领 |
| `createdAt`, `updatedAt` | timestamptz | |

**约束**：
- `UNIQUE(subjectType, subjectId)`
- `UNIQUE(fingerprintHash) WHERE subjectType='guest' AND fingerprintHash IS NOT NULL`（partial unique index；降级路径 fingerprint 为空，不参与唯一）

**匿名 bucket 查找协议**（事务内）：
1. 若 `fingerprintHash` 非空：`SELECT ... WHERE fingerprintHash=:fp AND subjectType='guest' FOR UPDATE` → 命中复用，同步把当前 `guestId` 写到该行的 `subjectId`（仅更新，不建）
2. 否则 / 未命中：`SELECT ... WHERE subjectType='guest' AND subjectId=:guestId FOR UPDATE`
3. 仍未命中：`INSERT ... ON CONFLICT (fingerprintHash) WHERE fingerprintHash IS NOT NULL DO NOTHING RETURNING *`；若 conflict 回到步骤 1

**消耗协议**（事务内）：
```
BEGIN;
SELECT ... FOR UPDATE;

-- 1. 惰性刷新（仅 USER_FREE_10MIN）
IF policy='USER_FREE_10MIN' AND nextRefillAt IS NOT NULL AND now() >= nextRefillAt:
    UPDATE ... SET remaining=capacity, nextRefillAt=NULL, exhaustedAt=NULL;

-- 2. 余额检查
IF remaining <= 0:
    RETURN REJECT(nextRefillAt);

-- 3. 扣减
UPDATE ... SET remaining = remaining - 1;

-- 4. 耗尽标记
IF new_remaining = 0 AND policy='USER_FREE_10MIN':
    UPDATE ... SET nextRefillAt = now() + INTERVAL '10 minutes', exhaustedAt = now();

COMMIT;
```

**退款协议**（事务内）：
```
BEGIN;
SELECT ... FOR UPDATE;
UPDATE ... SET remaining = LEAST(remaining + 1, capacity);
-- 若本次退款让 remaining 从 0 变正，清理冷却状态
IF old_remaining = 0:
    UPDATE ... SET nextRefillAt = NULL, exhaustedAt = NULL;
COMMIT;
```

---

## 5. API 契约（MF1：全部新增，不修改现有）

所有首页专用端点挂在 `/api/home/image/*`；读 `guest_id` cookie；前端用独立 hook（`use-home-generation`）。

### 5.1 `POST /api/home/image/submit`

**请求体**：`{ prompt, aspectRatio, resolution, modelId, fingerprintHash }`
**Cookie**：`guest_id`（中间件保证存在）

**处理顺序（严格）**：
1. **同步参数校验**：
   - `modelId` 必须为 `nano-banana`
   - 只允许 text-to-image（无 init image、无批量、无多图编辑）
   - `params` 白名单校验
   - 失败 → 400 `INVALID_PARAMS`，**不扣任何额度**
2. **并发检查**（MF1 + SA2）：调用 `checkConcurrency(subjectType, subjectId)`，若有 `pending` 作业 → 409 `CONCURRENT_LIMIT`
3. **有 session 分支**：
   - 若有现有付费能力（credits / entitlement / fair-use 任一命中）→ **不走 free quota**，调用 `/app` 的共享 provider service，写 `asset`
   - 否则 → `consumeFreeQuota({ subjectType:'user', subjectId:userId })`
4. **无 session 分支**：
   - 再次确认 nano-banana + text-to-image（防绕过），否则 403 `FEATURE_REQUIRES_LOGIN`
   - `consumeFreeQuota({ subjectType:'guest', subjectId:guestId, fingerprintHash })`
5. **扣减成功** → 写 `guest_generation`（匿名）或 `asset`（登录），调共享 provider service，返回 `{ jobId }`

**错误响应**：
- `402 { error: 'ANON_QUOTA_EXHAUSTED' }` → 前端弹 image2 登录弹窗，客户端暂存 pending 参数
- `402 { error: 'USER_QUOTA_EXHAUSTED', nextRefillAt }` → 前端弹 image3 倒计时弹窗
- `403 { error: 'FEATURE_REQUIRES_LOGIN' }` → 前端提示登录
- `409 { error: 'CONCURRENT_LIMIT' }` → 前端禁点 + 等待
- `429 { error: 'RATE_LIMITED' }` → 前端延迟重试
- `400 { error: 'INVALID_PARAMS' }` → 前端表单级错误

### 5.2 `GET /api/home/image/status?jobId=...`

- 有 session：查 `asset WHERE providerJobId=? AND userId=?`
- 无 session：查 `guest_generation WHERE providerJobId=? AND guestId=cookie.guestId`

### 5.3 `GET /api/home/image/quota`

**响应**：
```
{
  subjectType: 'guest' | 'user',
  remaining: number,
  capacity: number,
  policy: 'ANON_ONE_SHOT' | 'USER_FREE_10MIN',
  nextRefillAt: ISO8601 | null,
  exhausted: boolean,
  degraded: boolean  // 指纹采集失败时 true
}
```

### 5.4 `GET /api/home/image/recent`

**SA1：严格按会话状态分流，不能让匿名看到已 claim 的记录。**

- 无 session：`SELECT * FROM guest_generation WHERE guestId=cookie.guestId AND userId IS NULL ORDER BY createdAt DESC LIMIT 20`
- 有 session：`UNION` 的等价：
  - `SELECT * FROM asset WHERE userId=?`
  - `SELECT * FROM guest_generation WHERE userId=?`（claim 后的历史）
  - 合并按 `createdAt DESC LIMIT 20`

### 5.5 `POST /api/home/image/claim-guest`

登录成功回调后由前端主动触发。

**行为（事务）**：
1. 从 cookie 取 `guestId`；无则直接 200 `{ claimedCount: 0 }`
2. `UPDATE guest_generation SET userId=:uid WHERE guestId=:gid AND userId IS NULL`
3. `UPDATE quota_bucket SET linkedUserId=:uid WHERE subjectType='guest' AND subjectId=:gid`
4. **指纹归因**（防同设备多账号薅）：
   - 若当前请求携带的 `fingerprintHash` 非空，且 `SELECT quota_bucket WHERE linkedUserId IS NOT NULL AND linkedUserId != :uid AND fingerprintHash = :fp` 有命中
   - → 标记 `withheld = true`，**不创建/不重置** user bucket
5. **MF2：user bucket 创建逻辑**：
   ```sql
   INSERT INTO quota_bucket (subjectType, subjectId, remaining, capacity, policy)
   VALUES ('user', :uid, 5, 5, 'USER_FREE_10MIN')
   ON CONFLICT (subjectType, subjectId) DO NOTHING
   ```
   - bucket 不存在 → 创建，发初始 5 次
   - bucket 已存在 → **完全不动**（不重置 remaining，不清 nextRefillAt）
   - 若上一步判定 `withheld=true` → 跳过此 INSERT
6. 返回 `{ claimedCount, userQuota, withheld }`

### 5.6 `POST /api/home/image/refund`（内部调用）

- provider webhook 失败 / 超时 / 5xx 时由作业状态机内部调用
- 非公开 API，不暴露给前端
- 走 §4.2 的退款协议

---

## 6. 共享 service 层

**MF1 延伸要求**：首页路由和 /app 路由不共用端点，但底层「provider 调用 / 作业状态轮询 / webhook 处理」应提取为 service 模块，避免双倍实现。

建议结构：
```
src/services/image-generation/
  provider-submit.ts     // 调 Replicate/OpenAI 提交作业
  provider-webhook.ts    // 回调处理，更新状态到 asset 或 guest_generation
  concurrency.ts         // checkConcurrency(subjectType, subjectId) helper
src/credits/
  credits.ts             // 现有付费 credits
  entitlements.ts        // 现有订阅/fair-use（如已有则复用）
  free-quota.ts          // 新：lookupBucket / consume / refund / claim
```

**`checkConcurrency(subjectType, subjectId)` 实现**：
```
if subjectType == 'user':
  return db.query('SELECT COUNT(*) FROM asset WHERE userId = ? AND status = \'pending\'', subjectId)
if subjectType == 'guest':
  return db.query('SELECT COUNT(*) FROM guest_generation WHERE guestId = ? AND status = \'pending\'', subjectId)
```

---

## 7. 前端状态机

### 7.1 全局状态（首页专用 Zustand store）

```
homeQuotaState: {
  subjectType, remaining, capacity, nextRefillAt, policy, exhausted, degraded
}
pendingGeneration: { params } | null   // 登录拦截时暂存
sessionState: 'anon' | 'user'
homeRecentGenerations: Asset[]
```

### 7.2 事件流

| 触发 | 行为 |
|---|---|
| 首屏挂载 | 并发 `GET /quota` + `GET /recent` |
| 点 Generate | 若 `exhausted=true` 直接弹对应弹窗；否则 `POST /submit` |
| submit 402 ANON_QUOTA_EXHAUSTED | 暂存 params 到 `pendingGeneration`，打开登录弹窗 |
| submit 402 USER_QUOTA_EXHAUSTED | 打开倒计时弹窗，客户端纯前端倒计时到 `nextRefillAt` |
| submit 403 FEATURE_REQUIRES_LOGIN | 轻提示「该能力登录后开放」 |
| submit 409 CONCURRENT_LIMIT | 按钮态「生成中」，禁点；监听现有作业完成后复位 |
| submit 429 RATE_LIMITED | 延时重试 + 前端 toast |
| 登录成功回调 | `POST /claim-guest` → 刷 quota + recent → 若 `pendingGeneration` 存在，自动 resubmit |
| 倒计时归零 | 自动关弹窗，刷 quota，按钮恢复可点 |
| generation 完成（status 轮询返 completed） | 更新 `homeRecentGenerations`（服务端为真），同步 localStorage 缓存 |
| 匿名 `remaining=0` 按钮态 | 置灰；点击重开登录弹窗，不自动弹 |
| claim 返回 `withheld=true` | 前端提示「检测到此设备已关联其他账号，本次不发放新的免费额度」 |

### 7.3 localStorage 缓存策略

- key：`home:recentGenerations:<guestId or userId>`
- 写入时机：服务端 recent 查询返回后，客户端 mirror 一份
- 读取时机：首屏显示骨架屏 + localStorage 结果，服务端响应到达后覆盖
- 作用：仅加速首屏，不作为真相来源

---

## 8. 反薅羊毛分层

| 层 | 机制 | 强度 |
|---|---|---|
| L1 | 模型白名单：仅 nano-banana | 硬 |
| L2 | 功能白名单：仅 text-to-image；禁批量、禁多图、禁 img2img | 硬 |
| L3 | 并发限制：同一 subject 最多 1 个 `pending` | 硬 |
| L4 | `fingerprintHash` UNIQUE 绑定 bucket，堵清 cookie 重领 | 中 |
| L5 | `(IP + UA) hash` 短周期限流（正常 5/min；降级 2/min） | 中 |
| L6 | 社交登录指纹归因，跨账号同设备 `withheld` 不发新 quota | 中 |
| L7 | 降级额度：指纹失败时 capacity 从 5 降到 3 | 弱 |
| L8 | Turnstile | 暂不上，留观察窗 |

---

## 9. 策略清单

### 9.1 退款策略（free quota 专用）

| 情况 | 处理 |
|---|---|
| Provider 5xx / 超时 / 内部异常 | 退（事务 `remaining += 1`；清理冷却状态） |
| 内容审核 / 模型安全拒绝 | 不退（防 prompt 探边界） |
| 用户主动取消 | 不退 |
| 同步参数校验失败（模型不支持 / 参数非法） | 根本不扣 |

### 9.2 保留策略

| 对象 | 保留 |
|---|---|
| `guest_generation` 未 claim | 7 天后 GC |
| `guest_generation` 已 claim（`userId` 非空） | 永久保留 |
| `quota_bucket` | 不 GC |

### 9.3 登录联动策略

- Claim 成功：`guest_generation` in-place 改 owner；`quota_bucket.linkedUserId` 回填
- Claim 发现指纹已属他人：照常登录，`withheld=true`，不发新 quota
- Logout + 清 cookie + 回到匿名：由 `fingerprintHash` UNIQUE 找回旧 anon bucket（通常已耗尽）
- Logout 不清 cookie：同浏览器 `/recent` 会切换到「无 session 路径」，过滤掉 `userId IS NOT NULL` 的行，保护隐私（SA1）

### 9.4 社交登录指纹校验补齐

- Better Auth Google OAuth 目前**不过** [validate-registration.ts](src/actions/validate-registration.ts) 的指纹校验
- 需在 `onSignIn` / 等价 hook 中：
  - 记录本次登录携带的 `fingerprintHash`
  - 登录本身不拒；是否发新 quota 由 claim 流程决定

---

## 10. 分阶段上线顺序

| 阶段 | 内容 | 可独立验证 |
|---|---|---|
| P1 | Migration：`guest_generation` + `quota_bucket` + 所有索引 + partial unique | schema 单测 |
| P2 | `src/credits/free-quota.ts`：`lookupBucket` / `consumeFreeQuota` / `refundFreeQuota` / `claimGuest`；全带事务 + 行锁；`checkConcurrency` helper | 服务层单测（含并发压测） |
| P3 | 中间件：`guest_id` cookie 签发；IP+UA 限流（正常+降级两档） | 中间件集成测 |
| P4 | 共享 service 层：`provider-submit` / `provider-webhook` 抽取 | 回归 /app 原有功能 |
| P5 | 新增 `/api/home/image/*` 五个端点 | API 集成测 |
| P6 | 社交登录 `onSignIn` 补指纹记录 | 手测 + 日志 |
| P7 | 前端：`use-home-generation` hook；Zustand store；按钮态；登录弹窗带 `pendingGeneration` 暂存；倒计时弹窗；Recent Generations 面板 | E2E |
| P8 | 观测：匿名耗尽率、指纹撞库率、退款率、claim 成功率、降级路径占比 | 看板 |
| P9 | GC cron（未 claim 7 天清理） | cron 验证 |

---

## 11. 留待实现时敲定的小点

- `fingerprintHash` 采集在首屏挂载后多久内必须完成？超时后走降级路径还是重试？建议：500ms 超时，超时即进降级
- 倒计时弹窗关闭后是否保留「头像下拉入口」显示下次恢复时间？建议：保留，避免用户误以为彻底被拒
- Better Auth 的 OAuth 回调链里 `claim-guest` 挂在哪一步最稳？需要实现时看一下 `/api/auth/[...better-auth]` 的 hook 位置
- `guest_generation` 是否接 provider webhook 直接写回？目前假设 polling 够用；若 provider 支持并且 polling 有成本问题，可加 webhook
- `withheld=true` 时前端提示的具体文案和 CTA（「联系客服」？「切换账号」？）待产品确认
- 降级路径（指纹失败）的前端提示文案是否要上线即开？或先埋点不展示，观察占比后再决定

---

## 附录 A：与现有代码的集成点

| 现有文件 | 集成方式 |
|---|---|
| [src/db/schema.ts](src/db/schema.ts) | 新增两张表，不动现有 |
| [src/app/api/image-generation/submit/route.ts](src/app/api/image-generation/submit/route.ts) | **不改**，保持 /app 使用 |
| [src/hooks/use-image-generation.ts](src/hooks/use-image-generation.ts) | **不改**，/app 继续用 |
| [src/hooks/use-pending-generation.ts](src/hooks/use-pending-generation.ts) | **不改** |
| [src/components/blocks/hero/image-hero.tsx](src/components/blocks/hero/image-hero.tsx) | 接入新 `use-home-generation` hook，替换原 `use-image-generation` |
| [src/components/blocks/hero/image-operation-panel.tsx](src/components/blocks/hero/image-operation-panel.tsx) | 按钮态/错误分支更新；接入 quota store |
| [src/components/auth/login-modal.tsx](src/components/auth/login-modal.tsx) | 登录成功回调里插 `claim-guest` |
| [src/lib/fingerprint.ts](src/lib/fingerprint.ts) | 直接复用 |
| [src/hooks/use-fingerprint.ts](src/hooks/use-fingerprint.ts) | 直接复用 |
| [src/actions/validate-registration.ts](src/actions/validate-registration.ts) | 不改，在 Better Auth `onSignIn` 另补指纹记录 |
| [src/middleware.ts](src/middleware.ts) | 增加 `guest_id` 签发 + IP+UA 限流 |
| [src/credits/credits.ts](src/credits/credits.ts) | 不改，并列新增 `src/credits/free-quota.ts` |
