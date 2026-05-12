# 首页免费生成额度系统 — 设计方案 v3.1（定稿）

> 版本：v3.1（v3 + 12 条 patch + 2 条补充）
> 范围：仅首页 image hero 区域的 nano-banana text-to-image 路径
> 不影响：现有 `userCredit` / `creditTransaction` 付费体系；`/app` dashboard 完整生成流程；现有 `/api/image-generation/*` 路由群
> 状态：定稿，可进实现

---

## §0 前置不变量（HARD RULES）

以下规则在整个系统中不可违背。任何实现细节与下面冲突，以本节为准。

1. **身份分离**：`guest_id` 只负责**匿名历史与 claim**；`abuseBindKey` 只负责**匿名 free quota 与反薅**。两者绝不混用。
2. **`/recent` 查询绝不经过 `quota_bucket`**。历史身份只读 `guest_generation` / `asset`。
3. **`session` 存在时**，submit / consume / recent 查询路径**完全忽略** `guest_id`。唯一例外：`claim-guest` 流程中 `guest_id` 作为查找键使用。
4. **`abuseBindKey` 仅由服务端可观测值派生**。客户端传入的 `visitorId` 不参与 HMAC 输入，只作为 risk signal 单独记录。
5. **不持久化原始 IP / 原始 UA**。表中只存 `abuseBindKey` / `ipPrefixHash` / `uaHash` / `locale` 等衍生字段。
6. **`linkedUserId != null` 的 guest bucket 不允许匿名继续消费**。直接返回错误码 `ANON_BUCKET_LINKED_LOGIN_REQUIRED`。
7. **`claim-guest` 必须原子、幂等、且不得重置已存在的 user bucket**。
8. **`/quota` 响应必须携带 `serverNow`**，前端倒计时基于 offset 计算，不可信任本地时钟。
9. **`pendingGeneration` 必须落 `sessionStorage`**，禁止仅用内存/Zustand 存储（OAuth 跨标签跳转会丢）。
10. **`withheld=true` 时必须丢弃 pending generation，不允许自动续跑**。
11. **`Idempotency-Key` 必选**。submit 路径必须支持重放去重，不可双扣/双建作业。
12. **现有 `/api/image-generation/*` 路由不做任何侵入性修改**。首页专用路由独立在 `/api/home/image/*`。
13. **`Idempotency-Key` 必须前置保留**。在任何 quota 扣减、generation row 写入、provider submit **之前**，必须先完成 `home_idempotency` 表的 reserve。未保留成功的请求不得进入主流程。
14. **`claim-guest` 不得依赖登录当下重新计算的 `abuseBindKey`**。匿名 submit 时命中的稳定标识必须**持久化到 `guest_generation`**，claim 时以该稳定标识为准。
15. **不确定态失败不得立即退款**。对 provider 提交结果处于「不确定状态」的失败（本地 timeout、连接中断、上游 5xx 但无法确认是否已接单），不得立即退款，必须先进入 reconciliation。

---

## §1 产品目标

| 场景                                                      | 行为                                                                                                     |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 匿名首次进入首页                                          | 直接生成，累计 5 次（永久上限，不刷新）                                                                  |
| 匿名第 6 次点 Generate                                    | 弹登录弹窗（image 2），前端 `sessionStorage` 暂存 prompt 参数                                            |
| 登录成功（仍留在首页）                                    | 前端主动调 `claim-guest`；若 user bucket 不存在则创建（5 次初始），已存在则保留原值；10 分钟冷却策略生效 |
| claim 成功且无 `withheld`                                 | 自动续跑被拦下的那次生成                                                                                 |
| claim 返回 `withheld=true`                                | **不自动续跑**，丢弃 pending generation，提示"检测到此设备已关联其他账号"                                |
| 登录态连续用完 5 次                                       | 弹倒计时弹窗（image 3）；`remaining=0` 那一刻写 `nextRefillAt=now+10min`                                 |
| 登录态稀疏使用                                            | 不惩罚；只有 `remaining=0` 才写 `nextRefillAt`                                                           |
| 登录态有付费能力                                          | 走现有正式链路（entitlement / credits）；fair-use 在正式链路内部执行，**不触发免费额度 fallback**        |
| 匿名请求非 nano-banana 或非 text-to-image 或批量/多图     | 403 `FEATURE_REQUIRES_LOGIN`                                                                             |
| 命中 `linkedUserId != null` 的 guest bucket（已 claim 过） | 402 `ANON_BUCKET_LINKED_LOGIN_REQUIRED`，提示必须登录                                                    |
| 用户登出后同设备同浏览器                                  | 匿名查询 `guest_generation WHERE userId IS NULL` 过滤已 claim 的行，保护共享设备隐私                     |

---

## §2 核心决策摘要

| #   | 决策                            | 结论                                                                                            |
| --- | ------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | Free quota 是否进 credits 体系  | 否，独立系统                                                                                    |
| 2   | 匿名 5 次是否刷新               | 否，永久上限                                                                                    |
| 3   | 登录态 quota 模型               | 耗尽触发冷却（`remaining→0` 写 `nextRefillAt`）                                                 |
| 4   | 匿名 Recent Generations 存储    | 服务端 `guest_generation` 为真，`sessionStorage` 仅缓存                                         |
| 5   | 是否复用 `asset` 表             | 否，新建 `guest_generation`，**字段名镜像 `asset`**                                             |
| 6   | **匿名 quota 主体**             | **`abuseBindKey`**（服务端派生），不再是 `guestId`                                              |
| 7   | **匿名历史主体**                | **`guestId`**（签名 cookie）                                                                    |
| 8   | **客户端 `visitorId`**          | **不进 HMAC，仅作 risk signal**                                                                 |
| 9   | 覆盖模型范围                    | 仅 nano-banana + text-to-image                                                                  |
| 10  | Turnstile                       | 暂不接入，预留给"可疑流量触发"场景                                                              |
| 11  | `guest_generation` 保留期       | 7 天（未 claim）；已 claim 永久保留                                                             |
| 12  | `quota_bucket`                  | 永不 GC（linkedUserId 承担风控记忆）                                                            |
| 13  | 指纹撞已登录用户                | 允许登录，`withheld=true`，不发新 quota                                                         |
| 14  | Claim 方式                      | in-place 更新 `guest_generation.userId`；以 submit 当时持久化的 `quotaBucketId` 为 claim 首选键 |
| 15  | Claim 触发路径                  | 前端登录成功回调 + 首页挂载补调（双保险），**不依赖 Better Auth `onSignIn` hook**               |
| 16  | **付费能力判断**                | `hasPaidCapability(userId, modelId)` 只判断"是否应进入现有正式链路"（entitlement / credits / paid access）；**fair-use 不属于 capability 判断**，而是正式链路内部的 gate |
| 17  | **Session 存在时**              | submit / consume / recent **完全忽略** guest_id；claim 流程除外                                 |
| 18  | **logout 后命中 linked bucket** | **直接拒绝匿名消费**，错误码 `ANON_BUCKET_LINKED_LOGIN_REQUIRED`                                |
| 19  | **`/quota` serverNow**          | 必选字段，前端用 offset 计算倒计时                                                              |
| 20  | **`pendingGeneration` 存储**    | `sessionStorage`，非 Zustand memory                                                             |
| 21  | `Idempotency-Key`               | 必选 header，**前置 reserve**，不是事后记账                                                     |
| 22  | IP prefix 粒度                  | IPv4 `/24`、IPv6 `/48`（默认，可配置）                                                          |
| 23  | 测试策略                        | 阶段 1 手测脚本 + 验收清单；阶段 2 按需引入 vitest                                              |
| 24  | **Timeout / 不确定失败**        | **不立即退款**，进 reconciliation；MVP 阶段可简化为"不退 + 人工兜底"，完整阶段引入 async reconciler |
| 25  | **`/quota` 读路径**             | **惰性刷新**：`now >= nextRefillAt` 时同步 refill 再返回，保证 UI 永远看到最新状态              |

---

## §3 数据模型

### 3.1 `guest_generation`（新表，字段名镜像 `asset`）

| 字段                   | 类型                | 说明                                                                                         |
| ---------------------- | ------------------- | -------------------------------------------------------------------------------------------- |
| `id`                   | uuid pk             |                                                                                              |
| `guestId`              | text, not null      | 签名 cookie 里的匿名主体；只用于 recent / claim                                              |
| `userId`               | text, nullable      | claim 后回填；**逻辑归属字段，不设 FK**，避免用户删除后重新落回匿名可见集合                  |
| `quotaBucketId`        | text, nullable      | 匿名 submit 时命中的 guest `quota_bucket.id` 稳定标识；**claim 时优先使用**                  |
| `abuseBindKeySnapshot` | text, nullable      | submit 当下命中的 `abuseBindKey` 快照，仅作审计/兜底，不作为 claim 首选键                    |
| `providerRequestId`    | text, unique        | **镜像 asset 字段**，对上游 provider 的相关键；对 MaxAPI 当前即其 `taskId`                   |
| `status`               | text                | `pending` / `completed` / `failed`（**与现有 asset 实际存储值对齐，实施时以 schema.ts 为准**） |
| `modelId`              | text                | 当前仅 `nano-banana`                                                                         |
| `prompt`               | text                |                                                                                              |
| `inputImageUrls`       | jsonb, default `[]` | 预留，匿名路径当前恒为空                                                                     |
| `outputImageUrls`      | jsonb, default `[]` |                                                                                              |
| `thumbnailUrl`         | text, nullable      |                                                                                              |
| `errorMessage`         | text, nullable      |                                                                                              |
| `metadata`             | jsonb               | aspect ratio / resolution / etc.                                                             |
| `logs`                 | jsonb, nullable     |                                                                                              |
| `metrics`              | jsonb, nullable     |                                                                                              |
| `createdAt`, `updatedAt`, `completedAt` | timestamp | `.defaultNow()` on `createdAt`（对齐现有 schema）                                    |

**关于 `userId` 不设 FK**：`guest_generation.userId` 的归属语义是逻辑性的，不依赖 user 表生命周期。用户删除应由应用层显式处理（可选：指向"已删除用户" tombstone），不得因 FK 级联而让 claimed 历史回退成匿名可见。

**索引**：

- `idx_guest_gen_guest_created_anon`：partial `(guest_id, created_at DESC) WHERE user_id IS NULL` — 匿名 recent 查询
- `idx_guest_gen_user_created`：`(user_id, created_at DESC)` — 登录后 recent 查询（含已 claim）
- `idx_guest_gen_abuse_bind`：`(abuse_bind_key_snapshot)` — 风控分析
- `idx_guest_gen_quota_bucket`：`(quota_bucket_id)` — claim 时按稳定键查找
- `idx_guest_gen_provider_req`：唯一索引（由 `unique` 约束自动创建）

**GC**：`DELETE WHERE created_at < now() - INTERVAL '7 days' AND user_id IS NULL`

### 3.2 `quota_bucket`（新表）

| 字段                   | 类型           | 说明                                                          |
| ---------------------- | -------------- | ------------------------------------------------------------- |
| `id`                   | uuid pk        | **本字段值即 guest_generation.quotaBucketId 的来源**          |
| `subjectType`          | text           | `guest` / `user`                                              |
| `subjectId`            | text, not null | **guest 时 = `abuseBindKey`**；user 时 = `userId`             |
| `ipPrefixHash`         | text, nullable | guest 衍生字段（诊断/风控）                                   |
| `uaHash`               | text, nullable | 同上                                                          |
| `locale`               | text, nullable | 同上，`Accept-Language` 规范化后                              |
| `visitorIdRiskSignal`  | text, nullable | 客户端传入的 visitorId，**仅风控记录，不参与身份**            |
| `remaining`            | int, default 5 |                                                               |
| `capacity`             | int, default 5 |                                                               |
| `policy`               | text           | `ANON_ONE_SHOT` / `USER_FREE_10MIN`                           |
| `nextRefillAt`         | timestamp, nullable | `remaining→0` 时由 `USER_FREE_10MIN` 写入                |
| `exhaustedAt`          | timestamp, nullable | 审计                                                     |
| `linkedUserId`         | text, nullable | **逻辑记忆字段，不设 FK**；一旦写入，永久阻断 logout 后的匿名重领 |
| `createdAt`, `updatedAt` | timestamp    |                                                               |

**关于 `linkedUserId` 不设 FK**：`quota_bucket` 承担 anti-abuse memory，不依赖 user 表生命周期；即便用户被删除，`linkedUserId` 也不得因 FK 级联而消失。`cascade` 会抹掉"这台设备已绑定过账号"的记忆，和目标冲突。

**约束**：
- `UNIQUE(subject_type, subject_id)`
- `idx_quota_linked_user`：`(linked_user_id) WHERE linked_user_id IS NOT NULL` — claim 时的指纹归因查询

**Drizzle 实现细节**：列名 camelCase-JS、snake_case-SQL，对齐现有 schema 风格。`status` / `subjectType` / `policy` 用 `text`，不用 `pgEnum`（对齐现有 [schema.ts](src/db/schema.ts) `text("status")` 用法）。

**重要：`quota_bucket` 永不 GC**。linkedUserId 字段必须长期保留，是"防 logout 重领"的唯一依据。

### 3.3 `home_idempotency`（新表，首页 submit 去重账本）

首页专用。支撑 §0.13 的 Idempotency reserve 协议。

| 字段                | 类型               | 说明                                                 |
| ------------------- | ------------------ | ---------------------------------------------------- |
| `id`                | uuid pk            |                                                      |
| `subjectKey`        | text, not null     | guest 时 = `abuseBindKey`；user 时 = `userId`        |
| `idempotencyKey`    | text, not null     | 请求头传入                                           |
| `status`            | text               | `pending` / `succeeded` / `failed`                   |
| `requestHash`       | text, not null     | 对 body 规范化后 hash，防同 key 不同参数             |
| `responseCode`      | int, nullable      | 首次请求的响应码                                     |
| `responseBody`      | jsonb, nullable    | 首次请求的响应体                                     |
| `generationKind`    | text, nullable     | `asset` / `guest_generation`                         |
| `generationId`      | text, nullable     | 对应行 ID                                            |
| `providerRequestId` | text, nullable     | 上游 provider 任务 ID                                |
| `createdAt`, `updatedAt`, `expiresAt` | timestamp | |

**约束**：
- `UNIQUE(subject_key, idempotency_key)`

**语义**：
- 首次请求先插入 `pending`（reserve），占位全部后续副作用
- 后续 replay 直接读取该表：
  - `requestHash` 不同 → 409
  - `status='pending'` → 202/409（in-progress）
  - `status='succeeded'` / `'failed'` → 返回缓存响应
- `expiresAt` 默认 60 秒，可配置（`HOME_IDEMPOTENCY_TTL_SECONDS`）

**GC**：`DELETE WHERE expires_at < now()`，定时清理

---

## §4 身份派生与消费协议

### 4.1 `abuseBindKey` 派生（服务端，每次请求内）

**规范化流程**：

1. 提取 `ipPrefix`：IPv4 → `/24` prefix（前 3 字节）；IPv6 → `/48` prefix（前 6 字节）。**先截取 prefix，再 hash**，不能对完整 IP 先 hash 后映射。
2. 提取 `uaSignature`：仅保留稳定字段（browser family + major version + os family），忽略 minor version / build string / 漂移字段。参考 [ua-parser-js](https://www.npmjs.com/package/ua-parser-js)（若不引入新依赖，可自写一个最小正则提取器）。
3. 提取 `locale`：取 `Accept-Language` header 第一个语言标签，大小写规范化为 `en-US` / `zh-CN` 格式。
4. 构造输入串（**固定顺序、固定分隔符**）：
   ```
   input = ipPrefix + "\x1F" + uaSignature + "\x1F" + locale
   ```
   （`\x1F` = ASCII Unit Separator，避免任何字段内含普通字符造成注入歧义）
5. 计算 `abuseBindKey = HMAC_SHA256(ABUSE_BIND_SECRET, input)` → hex-encode
6. 同步衍生字段：
   ```
   ipPrefixHash = SHA256(ipPrefix) — hex
   uaHash = SHA256(uaSignature) — hex
   ```

**要求**：edge runtime 必须用 Web Crypto `subtle.sign` 实现 HMAC，不能用 Node `crypto.createHmac`（见 §7.5）。

### 4.2 guest bucket lookup（事务内，按 `abuseBindKey` 唯一）

```sql
BEGIN;

-- 步骤 1：按 abuseBindKey 查找
SELECT * FROM quota_bucket
  WHERE subject_type = 'guest' AND subject_id = :abuseBindKey
  FOR UPDATE;

-- 命中 → 进消费协议 §4.3
-- 未命中 → 步骤 2

-- 步骤 2：INSERT；并发下可能 CONFLICT（另一个请求已建同 abuseBindKey 的 bucket）
INSERT INTO quota_bucket (
  subject_type, subject_id, ip_prefix_hash, ua_hash, locale,
  visitor_id_risk_signal, remaining, capacity, policy
) VALUES (
  'guest', :abuseBindKey, :ipPrefixHash, :uaHash, :locale,
  :visitorId, 5, 5, 'ANON_ONE_SHOT'
)
ON CONFLICT (subject_type, subject_id) DO NOTHING
RETURNING *;

-- RETURNING 空 = CONFLICT 发生 → 回步骤 1（有界重试，MAX_RETRIES = 3）
```

**ON CONFLICT 仲裁器约束**：仲裁器 `(subject_type, subject_id)` 必须精确匹配 `UNIQUE(subject_type, subject_id)` 约束。Drizzle 的 `onConflictDoNothing({ target: [...] })` 支持该形式；**若将来改为 partial unique index（带 WHERE），则必须用 raw `sql` 模板**，因为 Drizzle 当前不支持 WHERE on conflict target。

**有界重试**：`MAX_RETRIES = 3`，超出抛 5xx。

**submit 时必须回写 guest_generation**：lookup 命中 / 新建后拿到的 `quota_bucket.id` 必须写入 `guest_generation.quotaBucketId`，claim 依赖此字段（§0.14）。`abuseBindKey` 的当下值也写入 `abuseBindKeySnapshot` 作为审计兜底。

### 4.3 消费协议（guest / user 统一）

```sql
BEGIN;

SELECT * FROM quota_bucket WHERE id = :id FOR UPDATE;

-- 步骤 1：linkedUserId 阻断（仅 guest bucket）
IF subject_type = 'guest' AND linked_user_id IS NOT NULL:
  ROLLBACK;
  RETURN ERROR 'ANON_BUCKET_LINKED_LOGIN_REQUIRED';

-- 步骤 2：惰性刷新（仅 USER_FREE_10MIN）
IF policy = 'USER_FREE_10MIN' AND next_refill_at IS NOT NULL AND now() >= next_refill_at:
  UPDATE quota_bucket SET
    remaining = capacity,
    next_refill_at = NULL,
    exhausted_at = NULL
  WHERE id = :id;

-- 步骤 3：余额检查
IF remaining <= 0:
  IF policy = 'USER_FREE_10MIN':
    ROLLBACK;
    RETURN ERROR 'USER_QUOTA_EXHAUSTED' { nextRefillAt };
  ELSE:
    ROLLBACK;
    RETURN ERROR 'ANON_QUOTA_EXHAUSTED';

-- 步骤 4：扣减
UPDATE quota_bucket SET remaining = remaining - 1 WHERE id = :id;

-- 步骤 5：耗尽标记
IF new_remaining = 0 AND policy = 'USER_FREE_10MIN':
  UPDATE quota_bucket SET
    next_refill_at = now() + INTERVAL '10 minutes',
    exhausted_at = now()
  WHERE id = :id;

COMMIT;
```

**idempotency 挂钩**：消费协议**不是入口**，`home_idempotency` reserve 才是（§5.1 step 3）。同一 idempotency key 的 replay 不会走到消费协议。

### 4.4 退款协议

```sql
BEGIN;
SELECT * FROM quota_bucket WHERE id = :id FOR UPDATE;
UPDATE quota_bucket SET remaining = LEAST(remaining + 1, capacity) WHERE id = :id;
-- 若 remaining 从 0 恢复为 1，清理冷却状态
IF old_remaining = 0:
  UPDATE quota_bucket SET next_refill_at = NULL, exhausted_at = NULL WHERE id = :id;
COMMIT;
```

**退款前提**：只在"已知不会再成功生成"时退款（参见 §8.1）。timeout 或不确定失败不直接调用本协议。

### 4.5 并发限制（`checkConcurrency`）

**反 TOCTOU 约束**：不可采用"先 COUNT 再 INSERT"模式。两种正确实现任选：

- **方案 A（推荐）**：`guest_generation` / `asset` 对 `(subjectId) WHERE status = '<与实际 schema 一致>'` 加 partial unique index。第二个并发 INSERT 触发 unique_violation，前端收 409。**实施时必须 verify 现有 `asset.status` 实际存储值大小写**，partial index 的谓词对齐。
- **方案 B**：消费协议和并发检查在**同一事务同一 `FOR UPDATE`** 区间内完成。bucket 行锁天然序列化了同 subject 的所有提交。

v3.1 推荐方案 B（已有 bucket 行锁），方案 A 作为二重保险。

### 4.6 `/quota` 读路径的惰性刷新

`GET /api/home/image/quota` 在返回前同样执行惰性刷新：

```sql
BEGIN;
SELECT * FROM quota_bucket WHERE id = :id FOR UPDATE;
IF policy = 'USER_FREE_10MIN' AND next_refill_at IS NOT NULL AND now() >= next_refill_at:
  UPDATE quota_bucket SET
    remaining = capacity,
    next_refill_at = NULL,
    exhausted_at = NULL
  WHERE id = :id;
COMMIT;
-- 返回最新状态
```

**原因**：避免前端收到"陈旧"状态（remaining=0 但 nextRefillAt 已过期）。DB 写开销可忽略（refill 是低频事件）。

---

## §5 API 契约

所有首页端点挂在 `/api/home/image/*`，**不修改现有 `/api/image-generation/*`**。

### 5.1 `POST /api/home/image/submit`

**Request headers**：

- `Idempotency-Key`（必选，客户端生成 UUID；同 key 短期内 replay 返回首次结果）
- `Cookie: guest_id`（middleware 在首页 HTML 请求时签发；若 API 调用时 cookie 缺失 → 400 `GUEST_COOKIE_MISSING`，前端刷页面重试）

**Request body**：

```json
{
  "prompt": "...",
  "aspectRatio": "1:1",
  "resolution": "1024x1024",
  "modelId": "nano-banana",
  "visitorId": "..." // optional, risk signal only
}
```

**处理顺序（严格）**：

1. **规范化请求体并计算 `requestHash`**（对 body 字段排序 + JSON stringify + SHA256）
2. **计算 `subjectKey`**
   - 有 session：`subjectKey = userId`
   - 无 session：派生 `abuseBindKey`（§4.1），`subjectKey = abuseBindKey`
3. **Idempotency reserve**（§0.13 前置保留）
   - 尝试 `INSERT INTO home_idempotency (subject_key, idempotency_key, request_hash, status='pending', expires_at) ON CONFLICT (subject_key, idempotency_key) DO NOTHING`
   - 若命中已有记录（INSERT 返回 0 rows）：
     - `requestHash` 不同 → 409 `IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD`
     - `status='pending'` → 202/409 `REQUEST_IN_PROGRESS`
     - `status in ('succeeded','failed')` → 直接返回缓存的 `responseCode` / `responseBody`
   - 新建成功 → 进入后续步骤；一切副作用挂在这条记录的 lifecycle 上
4. **同步参数校验**：`modelId='nano-banana'`、text-to-image、参数白名单
   - 失败 → `UPDATE home_idempotency SET status='failed', responseCode=400, responseBody=...`，返回 400 `INVALID_PARAMS`
   - **不扣额度，不建作业**
5. **有 session 分支**（§0.3 忽略 `guest_id`）：
   - `hasPaidCapability(userId, modelId)` 命中 → 走现有正式链路共享 service，写 `asset`
   - paid path 内部若命中 fair-use 限流 → **直接返回现有 paid/fair-use 错误，不得 fallback 到 free quota**（§2.16）
   - 否则 → `consumeFreeQuota({ subjectType: 'user', subjectId: userId })`
6. **无 session 分支**：
   - `consumeFreeQuota({ subjectType: 'guest', subjectId: abuseBindKey, riskSignals: { visitorId, ipPrefixHash, uaHash, locale } })`
   - `linkedUserId != null` 命中 → 402 `ANON_BUCKET_LINKED_LOGIN_REQUIRED`（§0.6）
7. **并发保护**：§4.5 方案 B（bucket 行锁）+ 方案 A（pending partial unique）
8. **写 `guest_generation`（匿名）或 `asset`（登录）**
   - 匿名侧必须同步写入 `quotaBucketId` 和 `abuseBindKeySnapshot`（§4.2 要求）
9. **调共享 provider service**（带 webhook URL）
10. **回填 `home_idempotency`**
    - `UPDATE home_idempotency SET status='succeeded', response_code, response_body, generation_kind, generation_id, provider_request_id WHERE ...`
11. **返回响应** `{ jobId: providerRequestId }`

**错误响应**：

- `402 { error: 'ANON_QUOTA_EXHAUSTED' }` → image2 登录弹窗
- `402 { error: 'USER_QUOTA_EXHAUSTED', nextRefillAt, serverNow }` → image3 倒计时弹窗
- `402 { error: 'ANON_BUCKET_LINKED_LOGIN_REQUIRED' }` → 新弹窗："此设备匿名额度已关联账号，请登录" + CTA
- `403 { error: 'FEATURE_REQUIRES_LOGIN' }` → 轻提示登录解锁
- `409 { error: 'CONCURRENT_LIMIT' }` → 按钮禁点
- `409 { error: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD' }` → 前端告警
- `409 { error: 'REQUEST_IN_PROGRESS' }` → 前端等待首次响应
- `429 { error: 'RATE_LIMITED' }` → 延迟重试
- `400 { error: 'INVALID_PARAMS' }` → 表单错误
- `400 { error: 'GUEST_COOKIE_MISSING' }` → 前端触发刷新/重试

### 5.2 `GET /api/home/image/status?jobId=...`

- **有 session**：
  1. `SELECT FROM asset WHERE provider_request_id = ? AND user_id = ?`
  2. 若未命中，再查 `SELECT FROM guest_generation WHERE provider_request_id = ? AND user_id = ?`
- **无 session**：
  `SELECT FROM guest_generation WHERE provider_request_id = ? AND guest_id = cookie.guest_id AND user_id IS NULL`

**原因**：覆盖"匿名时提交、登录后 claim、随后继续轮询"的场景，避免任务在 claim 后从 status API 中消失。

### 5.3 `GET /api/home/image/quota`

**响应**：

```json
{
  "subjectType": "guest" | "user",
  "remaining": 3,
  "capacity": 5,
  "policy": "ANON_ONE_SHOT" | "USER_FREE_10MIN",
  "nextRefillAt": "2026-04-18T10:30:00.000Z" | null,
  "exhausted": false,
  "degraded": false,
  "serverNow": "2026-04-18T10:20:00.000Z"
}
```

**读路径惰性刷新**：§4.6。

`serverNow` 必选。前端倒计时用：`remainingSeconds = (nextRefillAt - serverNow) - (Date.now() - fetchedAt)`。

**Cache-Control**: `no-store`（含用户状态，禁止 CDN 缓存）。

### 5.4 `GET /api/home/image/recent`

**严格按会话分流，匿名不可见已 claim 行**：

- 无 session：
  ```sql
  SELECT * FROM guest_generation
    WHERE guest_id = :cookie.guest_id AND user_id IS NULL
    ORDER BY created_at DESC LIMIT 20;
  ```
- 有 session：
  ```sql
  SELECT * FROM asset WHERE user_id = :uid
  UNION ALL
  SELECT * FROM guest_generation WHERE user_id = :uid
  ORDER BY created_at DESC LIMIT 20;
  ```

**`/recent` 绝不查询 `quota_bucket`**（§0.2）。

### 5.5 `POST /api/home/image/claim-guest`

**幂等、原子、冲突检查前置**。**不依赖登录当下派生的 `abuseBindKey`**（§0.14）。

**事务流程**：

1. **参数**：`session.userId`、`cookie.guest_id`
2. 若无 `guest_id` → 直接返回 `{ claimedCount: 0, withheld: false }`
3. **查 guest_id 对应的匿名记录，拿稳定 claim 键**：
   ```sql
   SELECT id, quota_bucket_id, abuse_bind_key_snapshot
     FROM guest_generation
     WHERE guest_id = :gid
     ORDER BY created_at DESC
     LIMIT 1;
   ```
4. **确定稳定 claim 键**：
   - 优先 `quotaBucketId`
   - 其次 `abuseBindKeySnapshot`（兜底）
   - 若都不存在 → 返回 `{ claimedCount: 0, withheld: false }`
5. **冲突检查（最先执行，只读）**：
   - `SELECT linked_user_id FROM quota_bucket WHERE id = :quotaBucketId FOR UPDATE`
   - 若 `linked_user_id IS NOT NULL AND linked_user_id != :uid` → `withheld = true`
6. **若 `withheld = true`**：
   - **不更新** `guest_generation.user_id`
   - **不更新** guest bucket
   - **不创建** user bucket
   - 直接返回 `{ claimedCount: 0, withheld: true }`
7. **若未 withheld**：
   - `UPDATE guest_generation SET user_id = :uid WHERE guest_id = :gid AND user_id IS NULL`
   - `UPDATE quota_bucket SET linked_user_id = :uid WHERE id = :quotaBucketId`
   - `INSERT INTO quota_bucket (subject_type, subject_id, remaining, capacity, policy) VALUES ('user', :uid, 5, 5, 'USER_FREE_10MIN') ON CONFLICT (subject_type, subject_id) DO NOTHING`（§0.7 不重置已有 user bucket）
8. **返回**：`{ claimedCount, userQuota, withheld }`

**幂等性**：重复调用无副作用。步骤 5 读多次结果一致；步骤 7 的 UPDATE 第二次无行可改；ON CONFLICT DO NOTHING 不重置已存在 bucket。

**不依赖 Better Auth hook**（§2.15）：前端在登录成功回调主动调用，首页挂载时若检测到 `session && cookie.guest_id && claimStatus=='idle'` 则补调一次。

### 5.6 Webhook 路由（扩展现有 `/api/image-generation/webhook/maxapi`）

**相关键定义**：

- 对 **MaxAPI**，当前回调载荷中的相关键是 `data.taskId`
- 本系统统一把这个值写入 `providerRequestId` 列（`asset.provider_request_id` 和 `guest_generation.provider_request_id`）
- 两张表的 `provider_request_id` 都加 UNIQUE 约束，应用层保证写入时全局唯一（生成路径只写一张表，不跨表重复）

**真实性校验（必选，前置）**：

- Handler 在处理 payload **之前**必须校验 webhook secret / callback token / provider signature
- 未通过校验 → 401/403，**绝不进入状态更新逻辑**
- 扩展到 `guest_generation` 前，必须先确认现有 MaxAPI webhook 已具备该校验；若没有，**P0 先补**

**路由逻辑**：

1. 校验 webhook 真实性
2. 解析 provider 回调，提取 `taskId`
3. 先查 `asset WHERE provider_request_id = :taskId`
4. 未命中则查 `guest_generation WHERE provider_request_id = :taskId`
5. 更新命中的那一行
6. 若都未命中，记录告警日志并返回 404/409

**未来 provider 扩展**：每接入一个新 provider，必须在设计文档里**显式列出**该 provider 的 correlation key（等价于 MaxAPI 的 `taskId`），避免隐式假设。

### 5.7 `refundFreeQuota`（**内部函数调用，非 HTTP 端点**）

为避免外部调用风险，**不注册为 HTTP 路由**。改为 `refundFreeQuota()` 函数，由 webhook handler / provider error path 在服务端直接调用。退款前提参见 §8.1。

---

## §6 前端状态机

### 6.1 Store 结构（Zustand，首页专用）

```ts
homeQuotaState: {
  subjectType, remaining, capacity, nextRefillAt, policy,
  exhausted, degraded, serverNow, fetchedAt
}
sessionState: 'anon' | 'user'
homeRecentGenerations: Asset[]
claimStatus: 'idle' | 'claiming' | 'claimed' | 'claim-failed' | 'withheld'
inFlightJob: { jobId, submittedAt } | null
// pendingGeneration 存 sessionStorage（§0.9），不放 store
```

**`pendingGeneration` 存储规则**：

- Key: `home:pendingGeneration`
- Value: `{ params, submittedAt }`
- 写入：402 `ANON_QUOTA_EXHAUSTED` 或 `ANON_BUCKET_LINKED_LOGIN_REQUIRED` 时
- 读取：登录成功回调 / 首页挂载补调 claim 成功后
- **强制清除**：claim 返回 `withheld=true`（§0.10）；resubmit 成功；用户手动关闭登录弹窗；TTL 超过 10 分钟

**`lastJobId` 存储规则**（用于刷新后恢复 in-flight）：

- Key: `home:lastJobId`
- 写入时机：**submit 返回 200 成功时**立即写入
- 清除时机：job 进入终态（completed / failed）或超时

### 6.2 事件流

**首屏挂载**（顺序执行）：

1. 并发 `GET /quota` + `GET /recent`
2. 渲染骨架屏 + sessionStorage 缓存（可选，用于首屏加速）
3. 服务端响应到达 → 覆盖 UI
4. 检查并恢复 in-flight job：若 `sessionStorage.lastJobId` 存在 → `GET /status?jobId=<lastJobId>`，根据返回状态恢复按钮态
5. 若 `session` 存在且 `cookie.guest_id` 存在且 `claimStatus == 'idle'` → 补调 `POST /claim-guest`
6. **若补调 `claim-guest` 成功且 `withheld=false`，且 `sessionStorage.pendingGeneration` 仍存在**：
   - 自动执行一次 `resubmitFromPending()`
   - 成功后清理 pending
   - 失败则保留 pending 并显示可重试入口

**注意**：首页挂载补调 claim 的成功分支必须与 `onLoginSuccess()` 共享**同一套** "claim → refresh quota → refresh recent → 续跑 pending" 状态机，不允许只补 claim、不补续跑。

**点 Generate**：

- 若 `homeQuotaState.exhausted` → 弹对应弹窗（不发请求）
- 否则 `POST /submit`（带 `Idempotency-Key`）→ 进 `inFlightJob` 态，写 `sessionStorage.lastJobId`

**submit 响应分支**：

| 响应                                                | 动作                                                          |
| --------------------------------------------------- | ------------------------------------------------------------- |
| 200                                                 | 写 `inFlightJob` + `lastJobId`，启 status 轮询                |
| 402 `ANON_QUOTA_EXHAUSTED`                          | 暂存 pending 到 sessionStorage，开登录弹窗                    |
| 402 `USER_QUOTA_EXHAUSTED`                          | 开倒计时弹窗，基于 `serverNow` + `nextRefillAt` 渲染          |
| 402 `ANON_BUCKET_LINKED_LOGIN_REQUIRED`             | **新弹窗**（不同于普通 anon exhausted），文案强调"此设备"      |
| 403 `FEATURE_REQUIRES_LOGIN`                        | 轻提示 + 登录入口                                             |
| 409 `CONCURRENT_LIMIT`                              | 按钮态"生成中"，监听 in-flight job 完成                        |
| 409 `IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD` | 开发者日志（理论不应发生）                                    |
| 409 `REQUEST_IN_PROGRESS`                           | 等待首次响应，不重试                                          |
| 429 `RATE_LIMITED`                                  | Toast + 指数回退重试（最多 2 次）                             |
| 400 `INVALID_PARAMS`                                | 表单字段级错误                                                |
| 400 `GUEST_COOKIE_MISSING`                          | 强制刷页面（middleware 签发 cookie）                          |

**登录成功**（三分支显式）：

```
onLoginSuccess():
  setClaimStatus('claiming')
  try:
    resp = await POST /claim-guest
    if resp.withheld:
      setClaimStatus('withheld')
      clearPendingGeneration()   // §0.10 强制丢弃
      showWithheldBanner()
      return
    setClaimStatus('claimed')
    await refreshQuota()
    await refreshRecent()
    if pendingGeneration exists:
      await resubmitFromPending()
      clearPendingGeneration()
  catch:
    setClaimStatus('claim-failed')
    showRetryButton()
```

**倒计时归零**：自动刷 `/quota`（触发 §4.6 惰性刷新），若 `remaining > 0` 关弹窗并恢复按钮。

**倒计时生命周期健壮性**：

- `document.visibilitychange`（页面从隐藏变可见）→ 重拉 `/quota`，重算 offset
- `window.focus` → 同上
- `Math.max(0, ...)` clamp 负值，避免系统睡眠后漂移

**匿名 `remaining = 0`（或 linked）按钮态**：置灰；点击重开对应登录弹窗（不自动弹）。

### 6.3 倒计时 A11y

- 外层容器 `role="timer"`
- `aria-label` 只在**分钟边界**更新（`aria-label="剩余 5 分钟"` → `"剩余 4 分钟"`）
- 秒级数字变化用纯视觉动画，不触发 `aria-live`
- 避免 `aria-live="polite"` 每秒刷屏幕阅读器

### 6.4 Recent Generations 渲染策略

**规则：server authoritative replace + optimistic merge**

- 首屏：sessionStorage 缓存先绘（marked `pending-server-confirm`）
- 服务端响应到达：**以服务端为准做 replace**：
  - 服务端有 + sessionStorage 有 → 原位更新为服务端版本
  - 服务端新增 → fade-in 追加
  - sessionStorage 有 + 服务端无（被 GC / claim 后归属变更） → fade-out 移除
- optimistic：本地 submit 成功后 optimistic 插入一条 `pending` 状态条目，服务端返回覆盖

### 6.5 LoginModal 集成

**现状**：[src/components/auth/login-modal.tsx](src/components/auth/login-modal.tsx) 当前仅支持 Google OAuth，文案硬编码。

**v3.1 需求**：

- 支持 `reason` prop：`'anon_exhausted' | 'feature_gated' | 'anon_linked' | 'default'`
- 文案按 reason 切换（见 §附录 C i18n key 列表）
- `onSuccess` 回调触发 `claim-guest`（不是在 Better Auth hook 内）
- 若 OAuth 回跳导致 `onSuccess` 未触发，首页挂载补调兜底（§6.2 步骤 5-6）

### 6.6 iOS Safari ITP 特别说明

- `guest_id` cookie httpOnly → 穿越 ITP 安全
- 但 fingerprint 采集 / visitorId 常在 iOS Safari 严格模式下失败
- 预期 iOS 匿名用户**大概率**走降级路径：`visitorId` 为空，`abuseBindKey` 纯靠 IP+UA+locale
- 降级路径下容量仍为 5（abuseBindKey 本身是服务端派生，不因 visitorId 缺失而降级）
- 前端**不**对 iOS 用户显示降级提示，避免造成"iOS 体验差"的错觉

---

## §7 反薅与隐私

### 7.1 分层

| 层  | 机制                                                        | 强度                        |
| --- | ----------------------------------------------------------- | --------------------------- |
| L1  | 模型白名单：仅 nano-banana                                  | 硬                          |
| L2  | 功能白名单：仅 text-to-image；禁批量、多图、img2img         | 硬                          |
| L3  | 并发限制：同一 subject 最多 1 个 `pending`                  | 硬                          |
| L4  | `abuseBindKey` 服务端派生，客户端不可控                     | 中                          |
| L5  | `(IP + UA) hash` 路由处理器侧限流（5/min；降级 2/min）      | 中                          |
| L6  | `linkedUserId` 阻断匿名消费，防 logout 重领                 | 中                          |
| L7  | `claim-guest` 冲突检查，跨账号同设备 `withheld`             | 中                          |
| L8  | Idempotency-Key 前置 reserve，防重放双扣                    | 中                          |
| L9  | Webhook 真实性校验（signature / token）                     | 硬（P0 必补）               |
| L10 | Turnstile                                                   | 预留，可疑流量触发时启用    |

### 7.2 已知 tradeoff（必须在实施前对齐预期）

- **移动网络 IP 漂移**：`/24` 前缀切换 = 新 `abuseBindKey` = 新 5 次。真实用户在地铁/高铁切基站会偶发"又得 5 次"，同时也意味着攻击者可通过 IP 切换绕过。相对于住宅代理池成本（$2-5/GB），对 nano-banana 这种低成本模型不构成经济问题。
- **多浏览器同设备**：Chrome / Firefox / Safari 各得 5 次。若用户家中真的多人共用一设备多浏览器，会得到 3×5 = 15 次。接受。
- **FingerprintJS 开源版**：不是主要防线（v3 已移到 risk signal）。iOS ITP 下大概率为空也不影响 quota 身份。
- **共享 NAT**：IP/24 + 同 UA + 同 locale 的不同真实用户会共用 bucket。典型场景：公司 / 学校 / 咖啡馆。缓解：UA 区分浏览器通常足够分流；严重场景再考虑引入客户端 visitorId 作为 HMAC 输入（目前明确不用）。

### 7.3 隐私约束

- **不持久化原始 IP / UA**：表中只存 hash / 衍生值（`ipPrefixHash`, `uaHash`, `locale`, `abuseBindKey`）
- **HTTP access log** 里的原始 IP 视团队现有 log policy 处理（如有短期留存可接受）
- 日志不打印完整 `abuseBindKey`，只打印前 8 位做诊断 correlation

### 7.4 环境变量（新增）

独立两个 secret，不共用：

- `ABUSE_BIND_SECRET`：`abuseBindKey` HMAC 密钥
- `GUEST_ID_SIGNING_SECRET`：guest_id cookie HMAC 密钥
- `MAXAPI_WEBHOOK_SECRET`（若现有 webhook 尚未有真实性校验，必须新增）

可配置项（可选，有默认）：

- `HOME_IP_PREFIX_V4`：默认 `24`
- `HOME_IP_PREFIX_V6`：默认 `48`
- `HOME_ANON_RATE_LIMIT_PER_MIN`：默认 `5`
- `HOME_DEGRADED_RATE_LIMIT_PER_MIN`：默认 `2`
- `HOME_IDEMPOTENCY_TTL_SECONDS`：默认 `60`
- `HOME_GUEST_GEN_RETENTION_DAYS`：默认 `7`

### 7.5 Edge runtime 约束

- HMAC 必须用 Web Crypto `subtle.sign('HMAC', ...)`，不能用 Node `crypto.createHmac`
- Rate limit **放在路由处理器**（`/api/home/image/*` 入口），**不放中间件**
  - 现有 [src/middleware.ts](src/middleware.ts) 的 matcher 已排除 `/api/`
  - Middleware 仅承担 `guest_id` cookie 签发，不承担限流
- Rate limit store：建议 Upstash Redis 或 Vercel KV；若项目暂无可用存储，先用内存 Map（单实例有效，Vercel 多实例下会误放行，作为首期 acceptable）

---

## §8 策略清单

### 8.1 退款策略（free quota）

**核心前提**：free quota 的退款前提必须是"已知不会再成功生成"，而不是"当前请求没有拿到成功响应"。

| 情况                                                                 | 处理                                                              |
| -------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Provider 明确失败（同步明确失败 / webhook failed / provider.result 明确失败） | 退                                                                |
| 内容审核 / 模型安全拒绝                                              | 不退（防 prompt 探边界）                                          |
| 用户主动取消                                                         | 不退                                                              |
| 同步参数校验失败                                                     | 根本不扣                                                          |
| **提交超时 / 网络中断 / 上游 5xx 且无法确认是否已接单**              | **不立即退款**；标记为 `submission_unknown`（或等价 metadata），进入 reconciliation |
| Reconciliation 结果确认"未创建 provider job"                         | 退                                                                |
| Reconciliation 结果确认"provider 已接单或已完成"                     | 不退                                                              |
| Idempotency replay 命中旧请求                                        | 不重复扣减，不重复退款                                            |

### 8.2 Reconciliation 的分阶段落地

| 阶段                | 行为                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| **MVP（P1-P10）**   | Timeout / 不确定失败 **不退款**；作业保留 `status='pending'`；人工兜底（若用户投诉，手动退）          |
| **完整阶段（后续）** | 引入 async reconciliation worker，定期查 provider status API；处理孤儿 pending 作业；自动退款或标记完成 |

MVP 阶段已经消除"白送"主路径（不再因 timeout 主动退款），完整阶段只是把人工兜底自动化。

### 8.3 保留策略

| 对象                                             | 保留                                                    |
| ------------------------------------------------ | ------------------------------------------------------- |
| `guest_generation` 未 claim（`user_id IS NULL`） | 7 天后 GC                                               |
| `guest_generation` 已 claim（`user_id` 非空）    | 永久保留                                                |
| `quota_bucket`                                   | **永不 GC**（`linked_user_id` 承担风控记忆）            |
| `home_idempotency`                               | `expires_at < now()` 定期 GC（默认 60s TTL）            |

### 8.4 登录联动策略

- Claim 成功（无 withheld）：
  - `guest_generation.user_id` in-place 回填
  - `quota_bucket.linked_user_id` 回填（guest bucket，按 `quotaBucketId` 定位）
  - 若 user bucket 不存在 → 创建初始 5 次；已存在 → 不动
- Claim 发现指纹已属他人（`linked_user_id != :uid`）：
  - `withheld = true`
  - 不执行 claim 更新和 user bucket 创建
  - 前端丢弃 pending generation（§0.10）
- Logout + 同浏览器回匿名：
  - `abuseBindKey` 仍能命中原 bucket（因为服务端信号未变）
  - `linked_user_id` 已非空 → 返回 `ANON_BUCKET_LINKED_LOGIN_REQUIRED`（§0.6）
  - 用户必须重新登录

---

## §9 实施计划

| 阶段     | 内容                                                                                                                          | 验证方式                                 |
| -------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **P0**   | **补现有 MaxAPI webhook 真实性校验**（若缺失）                                                                                | 手测伪造 webhook 被拒                    |
| P1       | DB migration：`guest_generation` + `quota_bucket` + `home_idempotency` + 所有索引；FK 全部 NO ACTION（逻辑归属不依赖 FK）        | 手测脚本 + 验收清单                      |
| P2       | `src/credits/free-quota.ts`：`deriveAbuseBindKey` / `lookupBucket` / `consumeFreeQuota` / `refundFreeQuota` / `claimGuest`；所有消费路径走事务 + 行锁 + 有界重试 | 手测脚本：模拟并发、linked、withheld     |
| P3       | `src/image/utils/provider-submit.ts` 抽取（对齐 [src/image/utils/](src/image/utils/) 现有风格）+ `checkConcurrency` helper      | 回归现有 `/app` 功能不变                 |
| P4       | 中间件：`guest_id` cookie 签发（Web Crypto）                                                                                  | 手测 cookie 签发/验证                    |
| P5       | `home_idempotency` reserve 逻辑（upsert + 状态机）                                                                            | 手测：双击、重放、不同 payload 复用 key  |
| P6       | `/api/home/image/*` 五个端点 + rate limit                                                                                     | 手测：各错误码、边界                     |
| P7       | Webhook 路由扩展：按 `providerRequestId` 先查 asset 再查 guest_generation                                                     | 手测 webhook 两种路径                    |
| P8       | 前端：`use-home-generation` hook、Zustand store（claimStatus / inFlightJob）、sessionStorage pendingGeneration + lastJobId、三弹窗（image2、image3、anon_linked）、倒计时 A11y、Recent Generations diff、visibilitychange/focus 重拉 | 手测 E2E                                 |
| P9       | 登录流程集成：LoginModal reason prop + 登录回调 claim + 首页挂载补调 + mount claim 后续跑                                     | 手测完整 claim 流程（含 withheld / 失败 / OAuth 回跳丢 callback） |
| P10      | 观测埋点：匿名耗尽率、linked 命中率、claim 成功率、withheld 率、退款率、iOS 降级占比；**敲定埋点落点**（PostHog / 自建 / console） | 看板验证                                 |
| P11      | GC cron：未 claim guest_generation 7 天清理 + home_idempotency 过期清理                                                       | 手测 cron 触发                           |
| P12（可选） | 若手测暴露回归风险较大，引入 vitest + 补单测覆盖 `free-quota.ts` 的并发路径 + idempotency 状态机                              | vitest 通过                              |
| P13（后续） | Reconciliation worker：定期扫 `submission_unknown` 作业，查 provider status API 决定退款或标记完成                            | 定期任务 + 看板                          |

**测试策略（§0 硬规则外的重申）**：

- 阶段 1（P0-P11）：**手测脚本 + 验收清单**，不假设已有测试框架
- 阶段 2（P12，可选）：若暴露并发/状态机回归风险，引入 vitest 补关键路径
- 阶段 3（P13）：reconciliation 是独立能力，可在主功能上线后再补
- 不把"单元测 / 集成测通过"写作默认前提

---

## §10 待敲定小点（已收口）

下列议题**已有默认规则**，不再作为 open question：

| #   | 议题                    | 结论                                                                     |
| --- | ----------------------- | ------------------------------------------------------------------------ |
| 1   | IP prefix 粒度          | IPv4 `/24`、IPv6 `/48`（默认，可配置）                                   |
| 2   | 测试框架                | 先手测，必要时 vitest                                                    |
| 3   | `visitorId` 角色        | **仅风控信号，不进 HMAC，不作为身份**（§0.4）                            |
| 4   | Claim 触发路径          | **前端回调 + 首页挂载补调，不依赖 Better Auth hook**（§2.15）            |
| 5   | Rate limit 位置         | 路由处理器侧，非 middleware                                              |
| 6   | Webhook 接入 guest_generation | **必须接入**（§5.6），不是 polling-or-webhook 二选一                |
| 7   | paid capability 边界    | **不含 fair-use**（§2.16、§附录 A）                                      |
| 8   | Timeout 退款            | **不立即退款，进 reconciliation**（§0.15、§8.1、§8.2）                   |

**实际仍需实施时敲定**：

| #   | 议题                    | 默认值                                                      |
| --- | ----------------------- | ----------------------------------------------------------- |
| A   | Rate limit store 宿主   | Upstash Redis / Vercel KV 首选；首期可用内存 Map            |
| B   | 监控落点                | P10 敲定（PostHog / 自建 log / 先 stdout）                  |
| C   | GC cron 宿主            | P11 敲定（Vercel Cron / 外部调度）                          |
| D   | `withheld` 文案与 CTA   | 产品侧确认后回填 §附录 C                                    |
| E   | Reconciliation worker 宿主 | P13 敲定                                                 |

---

## 附录 A：与现有代码的集成点

| 现有文件                                                                                                     | 集成方式                                                                         |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| [src/db/schema.ts](src/db/schema.ts)                                                                         | 新增三张表（`guest_generation` / `quota_bucket` / `home_idempotency`）；沿用现有 camelCase-JS + snake_case-SQL 风格；`status` 用 `text` 不用 `pgEnum` |
| [src/app/api/image-generation/submit/route.ts](src/app/api/image-generation/submit/route.ts)                 | **不改**                                                                         |
| [src/app/api/image-generation/status/route.ts](src/app/api/image-generation/status/route.ts)                 | **不改**                                                                         |
| `src/app/api/image-generation/webhook/maxapi/route.ts`                                                       | **扩展**：按 `providerRequestId`（即 MaxAPI `taskId`）先查 `asset`，未命中查 `guest_generation`；**真实性校验 P0 必补** |
| [src/hooks/use-image-generation.ts](src/hooks/use-image-generation.ts)                                       | **不改**（/app 继续用）                                                          |
| [src/hooks/use-pending-generation.ts](src/hooks/use-pending-generation.ts)                                   | **不改**                                                                         |
| [src/components/blocks/hero/image-hero.tsx](src/components/blocks/hero/image-hero.tsx)                       | 切到新 `use-home-generation` hook                                                |
| [src/components/blocks/hero/image-operation-panel.tsx](src/components/blocks/hero/image-operation-panel.tsx) | 按钮态、错误分支接入 home quota store                                            |
| [src/components/auth/login-modal.tsx](src/components/auth/login-modal.tsx)                                   | 加 `reason` prop；`onSuccess` 触发 `claim-guest`；文案 i18n 化                   |
| [src/components/auth/login-dialog.tsx](src/components/auth/login-dialog.tsx)                                 | 透传 `reason` prop                                                               |
| [src/lib/fingerprint.ts](src/lib/fingerprint.ts)                                                             | **保留**（注册校验仍用），但不进首页 abuseBindKey                                |
| [src/hooks/use-fingerprint.ts](src/hooks/use-fingerprint.ts)                                                 | **保留**；`visitorId` 走 risk signal 字段                                        |
| [src/lib/entitlements/fair-use.ts](src/lib/entitlements/fair-use.ts)                                         | **不改**；fair-use 仍在正式 paid path 内部执行                                   |
| [src/actions/validate-registration.ts](src/actions/validate-registration.ts)                                 | **不改**                                                                         |
| [src/middleware.ts](src/middleware.ts)                                                                       | **扩展**：`guest_id` cookie 签发（Web Crypto HMAC）；rate limit 不放这里         |
| [src/credits/credits.ts](src/credits/credits.ts)                                                             | **不改**；并列新增 `src/credits/free-quota.ts`                                   |
| [src/lib/auth.ts](src/lib/auth.ts)                                                                           | **不改**；不添加幻觉 `onSignIn` hook                                             |
| [src/lib/analytics/server.ts](src/lib/analytics/server.ts)                                                   | **待敲定**（P10）：当前 `trackServerEvent` 是 console stub，需决定是否接真实 sink |

**新增目录建议**：

- `src/credits/free-quota.ts` — 免费额度服务层
- `src/image/utils/provider-submit.ts` — 共享 provider 调用（对齐现有 `src/image/utils/` 风格）
- `src/image/utils/concurrency.ts` — `checkConcurrency` helper
- `src/lib/entitlements/has-paid-capability.ts` — 付费能力统一判断。**仅判断是否进入现有正式链路（entitlement / credits / paid access）；不包含 fair-use**。fair-use 继续留在正式 submit path 内部执行。
- `src/app/api/home/image/{submit,status,quota,recent,claim-guest}/route.ts` — 首页端点

**不使用 `src/services/` 目录**（非项目约定）。

---

## 附录 B：新增环境变量（需写入 `env.example`）

```
# === 首页免费额度系统 ===
ABUSE_BIND_SECRET=                    # HMAC 密钥，用于派生 abuseBindKey，独立于 auth secret
GUEST_ID_SIGNING_SECRET=              # HMAC 密钥，用于 guest_id cookie 签名
MAXAPI_WEBHOOK_SECRET=                # 若现有 webhook 尚未有真实性校验，P0 必补

# 以下可选，均有默认值
HOME_IP_PREFIX_V4=24                  # 默认 /24
HOME_IP_PREFIX_V6=48                  # 默认 /48
HOME_ANON_RATE_LIMIT_PER_MIN=5        # 匿名正常路径限流
HOME_DEGRADED_RATE_LIMIT_PER_MIN=2    # 预留给未来降级路径
HOME_IDEMPOTENCY_TTL_SECONDS=60       # home_idempotency TTL
HOME_GUEST_GEN_RETENTION_DAYS=7       # 未 claim guest_generation 保留天数
```

---

## 附录 C：i18n 新增 key 清单（需要 `messages/en.json` + `messages/zh.json`）

```
HomeQuota:
  loginModal:
    reasonAnonExhausted:
      title                            # "Login to unlock more free credits"
      body
      ctaLogin
      ctaCancel
    reasonAnonLinked:
      title                            # "This device's free quota is linked"
      body                             # "此设备的匿名额度已关联账号，请登录继续"
      ctaLogin
    reasonFeatureGated:
      title                            # "This feature requires login"
      body
      ctaLogin
  countdown:
    title                              # "Next free credits countdown"
    bodyWaiting                        # "Current credits support core homepage features..."
    refillsIn                          # "剩余 {minutes}:{seconds}"
    refillsInLabel                     # 屏幕阅读器 aria-label 版本
    ctaCancel
    ctaUpgrade                         # "Upgrade Plan (No waiting)"
  withheld:
    bannerTitle                        # "Detected prior account on this device"
    bannerBody
  errors:
    rateLimited                        # "Too fast, try again in a moment"
    concurrentLimit                    # "Another generation is in progress"
    invalidParams
    claimFailed                        # "Failed to link guest history, please retry"
    claimRetry
    requestInProgress                  # "Already processing, please wait"
    guestCookieMissing                 # "Session expired, refreshing..."
```

文案 draft 需产品侧确认（特别是 `withheld` 与 `anon_linked` 两个新增语义）。

---

## 附录 D：验收清单（P1-P11 手测用）

### Idempotency
- [ ] 首次 submit 带 Idempotency-Key=X：`home_idempotency` 写入 `pending`
- [ ] 同 key 同 payload 在 60s 内重放：返回首次缓存响应，quota 不变
- [ ] 同 key 不同 payload：409 `IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD`
- [ ] 同 key 在首次还是 pending 时重放：202/409 `REQUEST_IN_PROGRESS`
- [ ] 60s 后 TTL 过期，同 key 可复用
- [ ] 双击前端按钮（同 Idempotency-Key）：只扣一次额度

### DB & 消费协议
- [ ] 匿名首次请求创建 bucket，remaining=5，policy=ANON_ONE_SHOT
- [ ] 匿名连续 5 次后第 6 次返回 `ANON_QUOTA_EXHAUSTED`
- [ ] 清 cookie 后重新请求，abuseBindKey 未变 → 命中同一 bucket（仍 0 remaining）
- [ ] 切换 UA（同 IP+locale）→ 新 bucket 5 remaining（已知 tradeoff）
- [ ] 登录后：新 user bucket 5 remaining，policy=USER_FREE_10MIN
- [ ] 用完 5 次 → `nextRefillAt = now+10min`，弹倒计时弹窗
- [ ] 10 分钟后点 generate 消费时自动恢复 5 remaining（consume 惰性刷新）
- [ ] 10 分钟后 `GET /quota` 返回 remaining=5（**/quota 惰性刷新 §4.6**）
- [ ] 已有 user bucket 的用户再次登录 → bucket 不被重置
- [ ] claim 返回 `withheld=true` 时：guest_generation 未被回填，user bucket 未创建
- [ ] Logout 同浏览器回匿名 → 返回 `ANON_BUCKET_LINKED_LOGIN_REQUIRED`

### Claim 键稳定性（新）
- [ ] 匿名 submit 成功，`guest_generation.quotaBucketId` 被正确写入
- [ ] 用户换网络（IP prefix 变化）后登录 → claim 仍能按 `quotaBucketId` 定位到原 guest bucket
- [ ] claim 路径**不调用** `deriveAbuseBindKey`（代码层 assert）

### 并发
- [ ] 同 abuseBindKey 并发 10 个 submit（不同 Idempotency-Key）：最多 5 个成功，其余 `CONCURRENT_LIMIT` 或 `ANON_QUOTA_EXHAUSTED`；无 bucket 双建
- [ ] 同 user 并发 claim：user bucket 只被创建一次（ON CONFLICT DO NOTHING）
- [ ] 同 Idempotency-Key 并发 10 次：只有 1 个成功，其余命中 `REQUEST_IN_PROGRESS` 或缓存

### 前端
- [ ] `/quota` 响应含 `serverNow`，倒计时基于 offset（手改本机时间验证）
- [ ] `pendingGeneration` 落 sessionStorage，OAuth 跨标签跳转后 resubmit 成功
- [ ] `lastJobId` 在 submit 200 后写入 sessionStorage；刷新页面后 status 轮询恢复按钮态
- [ ] claim `withheld=true` → pending 被清，不 resubmit
- [ ] 倒计时弹窗归零后自动刷 quota 并关闭
- [ ] 倒计时弹窗在 `document.visibilitychange` / `window.focus` 时重拉 /quota
- [ ] 系统睡眠后恢复，倒计时不显示负值
- [ ] `ANON_BUCKET_LINKED_LOGIN_REQUIRED` 弹窗文案与 `ANON_QUOTA_EXHAUSTED` 不同
- [ ] Recent Generations 在 localStorage 有、server 无的情况下 fade-out
- [ ] 首页挂载补调 claim 成功后，自动续跑 pending generation（**mount 补调路径**）

### Status 查询（新）
- [ ] 匿名提交任务 → 登录 → claim → 轮询 status：能正确返回（先查 asset 未命中，落到 guest_generation WHERE userId=uid）
- [ ] 未 claim 的匿名任务：无 session 查询能返回

### 安全
- [ ] 客户端伪造 `visitorId`（每请求不同）不影响 abuseBindKey（HMAC 不含该字段）
- [ ] 客户端不传 `visitorId` → abuseBindKey 仍可派生（IP+UA+locale）
- [ ] 调用 `refundFreeQuota` 相关的 HTTP 路径 → 404（未注册）
- [ ] `/api/home/image/*` 的原始 IP / UA 不落 DB，只查 `ip_prefix_hash` / `ua_hash`
- [ ] `ABUSE_BIND_SECRET` 未设 → 服务端启动报错（fail-fast）
- [ ] Webhook 伪造（缺 signature / wrong secret）→ 401/403，不更新任何状态

### Webhook
- [ ] 匿名作业的 MaxAPI webhook 回调写入 `guest_generation`
- [ ] 登录作业的 webhook 写入 `asset`
- [ ] webhook 先查 asset 未命中，再查 guest_generation，路由正确
- [ ] 跨表 `providerRequestId` 冲突（理论不应发生）→ 应用层拒绝写入

### 退款
- [ ] Provider 明确失败（webhook failed 或同步失败）→ 退款，remaining+1，必要时清 nextRefillAt
- [ ] 内容审核拒绝 → 不退款
- [ ] 用户取消 → 不退款
- [ ] 同步参数错误 → 根本不扣
- [ ] Timeout / 5xx 不确定 → **不退款**，作业标记 `submission_unknown`
- [ ] Idempotency replay → 不重复扣减也不重复退款

---

**v3.1 定稿**。相对 v3 的主要变化：

1. §0 新增 3 条硬规则（Idempotency 前置 / Claim 稳定键 / Timeout 不退）
2. §3 新增 `home_idempotency` 表
3. §3.1 `guest_generation` 新增 `quotaBucketId` + `abuseBindKeySnapshot` 字段；`userId` 去 FK
4. §3.2 `quota_bucket.linkedUserId` 去 FK（逻辑字段）
5. §4.6 新增 `/quota` 读路径惰性刷新
6. §5.1 submit 改为 11 步，Idempotency reserve 前置
7. §5.2 status 登录态 UNION 两表
8. §5.5 claim 改为按 `quotaBucketId` 定位
9. §5.6 webhook 明确 `taskId` 即 `providerRequestId`；真实性校验 P0 必补
10. §8.1 退款表重写，timeout 进 reconciliation
11. §8.2 Reconciliation 分阶段
12. §2 row 16 + 附录 A：`hasPaidCapability` 不含 fair-use
13. §6.2 mount 补调 claim 后续跑 pending 显式画出
14. §10 已收口项与实施时敲定项分离
15. 附录 D 新增多项验收点（idempotency / claim 稳定键 / status UNION / webhook 安全）

下一步：DB + Security 精简 review。
