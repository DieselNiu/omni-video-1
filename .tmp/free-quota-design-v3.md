# 首页免费生成额度系统 — 设计方案 v3（定稿）

> 版本：v3（整合 v1 → v2 → v2 勘误 → β 方案 → v3 patch checklist → 实现细节精修）
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

---

## §1 产品目标

| 场景                                                       | 行为                                                                                                     |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 匿名首次进入首页                                           | 直接生成，累计 5 次（永久上限，不刷新）                                                                  |
| 匿名第 6 次点 Generate                                     | 弹登录弹窗（image 2），前端 `sessionStorage` 暂存 prompt 参数                                            |
| 登录成功（仍留在首页）                                     | 前端主动调 `claim-guest`；若 user bucket 不存在则创建（5 次初始），已存在则保留原值；10 分钟冷却策略生效 |
| claim 成功且无 `withheld`                                  | 自动续跑被拦下的那次生成                                                                                 |
| claim 返回 `withheld=true`                                 | **不自动续跑**，丢弃 pending generation，提示"检测到此设备已关联其他账号"                                |
| 登录态连续用完 5 次                                        | 弹倒计时弹窗（image 3）；`remaining=0` 那一刻写 `nextRefillAt=now+10min`                                 |
| 登录态稀疏使用                                             | 不惩罚；只有 `remaining=0` 才写 `nextRefillAt`                                                           |
| 登录态有付费能力                                           | 走现有正式链路（entitlement / credits / fair-use 任一命中），不触发免费额度                              |
| 匿名请求非 nano-banana 或非 text-to-image 或批量/多图      | 403 `FEATURE_REQUIRES_LOGIN`                                                                             |
| 命中 `linkedUserId != null` 的 guest bucket（已 claim 过） | 402 `ANON_BUCKET_LINKED_LOGIN_REQUIRED`，提示必须登录                                                    |
| 用户登出后同设备同浏览器                                   | 匿名查询 `guest_generation WHERE userId IS NULL` 过滤已 claim 的行，保护共享设备隐私                     |

---

## §2 核心决策摘要

| #   | 决策                            | 结论                                                                              |
| --- | ------------------------------- | --------------------------------------------------------------------------------- |
| 1   | Free quota 是否进 credits 体系  | 否，独立系统                                                                      |
| 2   | 匿名 5 次是否刷新               | 否，永久上限                                                                      |
| 3   | 登录态 quota 模型               | 耗尽触发冷却（`remaining→0` 写 `nextRefillAt`）                                   |
| 4   | 匿名 Recent Generations 存储    | 服务端 `guest_generation` 为真，`sessionStorage` 仅缓存                           |
| 5   | 是否复用 `asset` 表             | 否，新建 `guest_generation`，**字段名镜像 `asset`**                               |
| 6   | **匿名 quota 主体**             | **`abuseBindKey`**（服务端派生），不再是 `guestId`                                |
| 7   | **匿名历史主体**                | **`guestId`**（签名 cookie）                                                      |
| 8   | **客户端 `visitorId`**          | **不进 HMAC，仅作 risk signal**                                                   |
| 9   | 覆盖模型范围                    | 仅 nano-banana + text-to-image                                                    |
| 10  | Turnstile                       | 暂不接入，预留给"可疑流量触发"场景                                                |
| 11  | `guest_generation` 保留期       | 7 天（未 claim）；已 claim 永久保留                                               |
| 12  | `quota_bucket`                  | 永不 GC（linkedUserId 承担风控记忆）                                              |
| 13  | 指纹撞已登录用户                | 允许登录，`withheld=true`，不发新 quota                                           |
| 14  | Claim 方式                      | in-place 更新 `guest_generation.userId`                                           |
| 15  | Claim 触发路径                  | 前端登录成功回调 + 首页挂载补调（双保险），**不依赖 Better Auth `onSignIn` hook** |
| 16  | 付费能力判断                    | `hasPaidCapability(userId, modelId)`（entitlement / credits / fair-use 任一命中） |
| 17  | **Session 存在时**              | submit / consume / recent **完全忽略** guest_id；claim 流程除外                   |
| 18  | **logout 后命中 linked bucket** | **直接拒绝匿名消费**，错误码 `ANON_BUCKET_LINKED_LOGIN_REQUIRED`                  |
| 19  | **`/quota` serverNow**          | 必选字段，前端用 offset 计算倒计时                                                |
| 20  | **`pendingGeneration` 存储**    | `sessionStorage`，非 Zustand memory                                               |
| 21  | `Idempotency-Key`               | 必选 header                                                                       |
| 22  | IP prefix 粒度                  | IPv4 `/24`、IPv6 `/48`（默认，可配置）                                            |
| 23  | 测试策略                        | 阶段 1 手测脚本 + 验收清单；阶段 2 按需引入 vitest                                |

---

## §3 数据模型

### 3.1 `guest_generation`（新表，字段名镜像 `asset`）

| 字段                                    | 类型                                            | 说明                                                        |
| --------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------- |
| `id`                                    | uuid pk                                         |                                                             |
| `guestId`                               | text, not null                                  | 签名 cookie 里的匿名主体；`guest_id` SQL 列                 |
| `userId`                                | text, nullable, FK→user, **onDelete: set null** | claim 后打戳；set null 允许 GC 回收已删除用户的记录         |
| `abuseBindKey`                          | text, nullable                                  | 创建时服务端派生；用于风控归因，非查询主键                  |
| `providerRequestId`                     | text, unique                                    | **镜像 asset 字段**，provider 侧作业 ID                     |
| `status`                                | text                                            | `pending` / `completed` / `failed`（与 asset 字符串值一致） |
| `modelId`                               | text                                            | 当前仅 `nano-banana`                                        |
| `prompt`                                | text                                            |                                                             |
| `inputImageUrls`                        | jsonb, default `[]`                             | 预留，匿名路径当前恒为空                                    |
| `outputImageUrls`                       | jsonb, default `[]`                             |                                                             |
| `thumbnailUrl`                          | text, nullable                                  |                                                             |
| `errorMessage`                          | text, nullable                                  |                                                             |
| `metadata`                              | jsonb                                           | aspect ratio / resolution / etc.                            |
| `logs`                                  | jsonb, nullable                                 |                                                             |
| `metrics`                               | jsonb, nullable                                 |                                                             |
| `createdAt`, `updatedAt`, `completedAt` | timestamp                                       | `.defaultNow()` on `createdAt`（对齐现有 schema）           |

**索引**：

- `idx_guest_gen_guest_created_anon`：partial `(guest_id, created_at DESC) WHERE user_id IS NULL` — 匿名 recent 查询
- `idx_guest_gen_user_created`：`(user_id, created_at DESC)` — 登录后 recent 查询
- `idx_guest_gen_abuse_bind`：`(abuse_bind_key)` — 风控分析
- `idx_guest_gen_provider_req`：唯一索引（由 `unique` 约束自动创建）

**GC**：`DELETE WHERE created_at < now() - INTERVAL '7 days' AND user_id IS NULL`

### 3.2 `quota_bucket`（新表）

| 字段                     | 类型                                           | 说明                                                             |
| ------------------------ | ---------------------------------------------- | ---------------------------------------------------------------- |
| `id`                     | uuid pk                                        |                                                                  |
| `subjectType`            | text                                           | `guest` / `user`                                                 |
| `subjectId`              | text, not null                                 | **guest 时 = `abuseBindKey`**；user 时 = `userId`                |
| `ipPrefixHash`           | text, nullable                                 | guest 衍生字段（诊断/风控）                                      |
| `uaHash`                 | text, nullable                                 | 同上                                                             |
| `locale`                 | text, nullable                                 | 同上，`Accept-Language` 规范化后                                 |
| `visitorIdRiskSignal`    | text, nullable                                 | 客户端传入的 visitorId，**仅风控记录，不参与身份**               |
| `remaining`              | int, default 5                                 |                                                                  |
| `capacity`               | int, default 5                                 |                                                                  |
| `policy`                 | text                                           | `ANON_ONE_SHOT` / `USER_FREE_10MIN`                              |
| `nextRefillAt`           | timestamp, nullable                            | `remaining→0` 时由 `USER_FREE_10MIN` 写入                        |
| `exhaustedAt`            | timestamp, nullable                            | 审计                                                             |
| `linkedUserId`           | text, nullable, FK→user, **onDelete: cascade** | claim 后 guest bucket 回填，防 logout 重领；cascade 删除保持一致 |
| `createdAt`, `updatedAt` | timestamp                                      |                                                                  |

**约束**：

- `UNIQUE(subject_type, subject_id)`
- `idx_quota_linked_user`：`(linked_user_id) WHERE linked_user_id IS NOT NULL` — claim 时的指纹归因查询

**Drizzle 实现细节**：列名 camelCase-JS、snake_case-SQL，对齐现有 schema 风格。`status` / `subjectType` / `policy` 用 `text`，不用 `pgEnum`（对齐现有 [schema.ts](src/db/schema.ts) `text("status")` 用法）。

**重要：`quota_bucket` 永不 GC**。linkedUserId 字段必须长期保留，是"防 logout 重领"的唯一依据。

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

**有界重试**：重试次数 `MAX_RETRIES = 3`，超出抛 5xx。预期实际冲突极低（partition on abuseBindKey 本身已分散）。

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

**idempotency 挂钩**：消费协议入口前必须先过 §5.1 的 `Idempotency-Key` 查表；命中 replay 直接返回缓存结果，**不进消费协议**。

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

### 4.5 并发限制（`checkConcurrency`）

**反 TOCTOU 约束**：不可采用"先 COUNT 再 INSERT"模式。两种正确实现任选：

- **方案 A（推荐）**：`guest_generation` / `asset` 对 `(subjectId) WHERE status = 'pending'` 加 partial unique index。第二个并发 INSERT 触发 unique_violation，前端收 409。
- **方案 B**：消费协议和并发检查在**同一事务同一 `FOR UPDATE`** 区间内完成。bucket 行锁天然序列化了同 subject 的所有提交。

v3 推荐方案 B（已有 bucket 行锁），方案 A 作为二重保险。

---

## §5 API 契约

所有首页端点挂在 `/api/home/image/*`，**不修改现有 `/api/image-generation/*`**。

### 5.1 `POST /api/home/image/submit`

**Request headers**：

- `Idempotency-Key`（必选，客户端生成 UUID；同 key 短期内 replay 返回首次结果）
- `Cookie: guest_id`（中间件保证存在，若无 session）

**Request body**：

```json
{
  "prompt": "...",
  "aspectRatio": "1:1",
  "resolution": "1024x1024",
  "modelId": "nano-banana",
  "visitorId": "..."  // optional, risk signal only
}
```

**处理顺序（严格）**：

1. **Idempotency 查表**：若 `(subjectKey, idempotencyKey)` 命中近 60s 记录，直接返回缓存响应
2. **同步参数校验**：`modelId = 'nano-banana'`、text-to-image（无 input image）、参数白名单 — 失败 400 `INVALID_PARAMS`，**不扣任何额度，不建作业**
3. **有 session 分支**：
   - **完全忽略 cookie.guest_id**（§0.3）
   - `hasPaidCapability(userId, modelId)` 命中 → 走 `/app` 正式链路共享 service，写 `asset`
   - 否则 → `consumeFreeQuota({ subjectType: 'user', subjectId: userId })`
4. **无 session 分支**：
   - 派生 `abuseBindKey`（§4.1）
   - `consumeFreeQuota({ subjectType: 'guest', subjectId: abuseBindKey, riskSignals: { visitorId, ipPrefixHash, uaHash, locale } })`
   - `linkedUserId != null` 命中 → 402 `ANON_BUCKET_LINKED_LOGIN_REQUIRED`
5. **并发检查**：§4.5 方案 B（bucket 行锁） + 方案 A（pending partial unique）
6. **扣减成功** → 写 `guest_generation`（匿名）或 `asset`（登录），调共享 provider service（带 webhook URL），返回 `{ jobId: providerRequestId }`
7. **Idempotency 记账**：`(subjectKey, idempotencyKey, response)` 写入 60s TTL 存储（建议 Redis 或 DB 小表）

**错误响应**：

- `402 { error: 'ANON_QUOTA_EXHAUSTED' }` → image2 登录弹窗
- `402 { error: 'USER_QUOTA_EXHAUSTED', nextRefillAt, serverNow }` → image3 倒计时弹窗
- `402 { error: 'ANON_BUCKET_LINKED_LOGIN_REQUIRED' }` → 新弹窗："此设备匿名额度已关联账号，请登录" + CTA
- `403 { error: 'FEATURE_REQUIRES_LOGIN' }` → 轻提示登录解锁
- `409 { error: 'CONCURRENT_LIMIT' }` → 按钮禁点
- `429 { error: 'RATE_LIMITED' }` → 延迟重试
- `400 { error: 'INVALID_PARAMS' }` → 表单错误

### 5.2 `GET /api/home/image/status?jobId=...`

- 有 session：`SELECT FROM asset WHERE provider_request_id = ? AND user_id = ?`
- 无 session：`SELECT FROM guest_generation WHERE provider_request_id = ? AND guest_id = cookie.guest_id AND user_id IS NULL`

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

`serverNow` 必选。前端倒计时用：`remainingSeconds = (nextRefillAt - serverNow) - (Date.now() - fetchedAt)`。

**Cache-Control**: `no-store`（含用户状态，禁止 CDN 缓存）。

### 5.4 `GET /api/home/image/recent`

**SA1：严格按会话分流，匿名不可见已 claim 行**：

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

**幂等、原子、冲突检查前置**。

**事务流程**：

```sql
BEGIN;

-- 1. 参数：session.userId, cookie.guest_id, 当前请求派生的 abuseBindKey
-- 若 cookie.guest_id 缺失 → 直接 200 { claimedCount: 0, withheld: false }

-- 2. 冲突检查（只读，最先执行）：
SELECT linked_user_id FROM quota_bucket
  WHERE subject_type = 'guest'
    AND linked_user_id IS NOT NULL
    AND linked_user_id != :uid
    AND subject_id = :abuseBindKey
  LIMIT 1;

-- 若有结果 → withheld = true，跳过步骤 5

-- 3. 更新匿名生成记录归属
UPDATE guest_generation SET user_id = :uid
  WHERE guest_id = :gid AND user_id IS NULL;

-- 4. 更新 guest bucket 的 linkedUserId
UPDATE quota_bucket SET linked_user_id = :uid
  WHERE subject_type = 'guest' AND subject_id = :abuseBindKey;

-- 5. 创建 user bucket（若不存在）
IF NOT withheld:
  INSERT INTO quota_bucket (
    subject_type, subject_id, remaining, capacity, policy
  ) VALUES ('user', :uid, 5, 5, 'USER_FREE_10MIN')
  ON CONFLICT (subject_type, subject_id) DO NOTHING;

COMMIT;

RETURN {
  claimedCount: <rows affected in step 3>,
  userQuota: <SELECT ... WHERE subject_type='user' AND subject_id=:uid>,
  withheld: <boolean>
};
```

**幂等性**：重复调用无副作用。步骤 2 读多次结果一致；步骤 3/4 的 UPDATE 第二次无行可改；步骤 5 的 ON CONFLICT DO NOTHING 不会重置已存在 bucket。

**不依赖 Better Auth hook**（§2.15）：前端在登录成功回调主动调用，首页挂载时若检测到 `session && cookie.guest_id` 且 bucket 未 claim 则补调一次。

### 5.6 Webhook 路由（扩展现有 `/api/image-generation/webhook/maxapi`）

**关键**：webhook handler 必须按 `providerRequestId` 在两张表中路由：

```
handler(webhookPayload):
  requestId = webhookPayload.providerRequestId

  -- 先查 asset
  asset = SELECT FROM asset WHERE provider_request_id = requestId
  IF asset: update asset, done

  -- fallback 查 guest_generation
  guest = SELECT FROM guest_generation WHERE provider_request_id = requestId
  IF guest: update guest_generation, done

  -- 都没找到：log + 409
```

**约束**：`asset.providerRequestId` 和 `guest_generation.providerRequestId` 必须全局唯一（两表各自 unique 约束 + 应用层保证不跨表重复）。

### 5.7 `POST /api/home/image/refund`（**内部函数调用，非 HTTP 端点**）

为避免外部调用风险，**不注册为 HTTP 路由**。改为 `refundFreeQuota()` 函数，由 webhook handler / provider error path 在服务端直接调用。

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

### 6.2 事件流

**首屏挂载**（顺序执行）：

1. 并发 `GET /quota` + `GET /recent`
2. 渲染骨架屏 + localStorage 缓存（可选，用于首屏加速）
3. 服务端响应到达 → 覆盖 UI
4. 检查并恢复 in-flight job：`GET /status?jobId=<sessionStorage.lastJobId>`（若存在）
5. **若 `session` 存在且 `cookie.guest_id` 存在且 `claimStatus == 'idle'`** → 补调 `POST /claim-guest`

**点 Generate**：

- 若 `homeQuotaState.exhausted` → 弹对应弹窗（不发请求）
- 否则 `POST /submit`（带 `Idempotency-Key`）→ 进 `inFlightJob` 态

**submit 响应分支**：
| 响应 | 动作 |
|---|---|
| 200 | 写 `inFlightJob`，启 status 轮询 |
| 402 `ANON_QUOTA_EXHAUSTED` | 暂存 pending 到 sessionStorage，开登录弹窗 |
| 402 `USER_QUOTA_EXHAUSTED` | 开倒计时弹窗，基于 `serverNow` + `nextRefillAt` 渲染 |
| 402 `ANON_BUCKET_LINKED_LOGIN_REQUIRED` | **新弹窗**（不同于普通 anon exhausted），文案强调"此设备" |
| 403 `FEATURE_REQUIRES_LOGIN` | 轻提示 + 登录入口 |
| 409 `CONCURRENT_LIMIT` | 按钮态"生成中"，监听 in-flight job 完成 |
| 429 `RATE_LIMITED` | Toast + 指数回退重试（最多 2 次） |
| 400 | 表单字段级错误 |

**登录成功**（三分支显式）：

```
onLoginSuccess():
  setClaimStatus('claiming')
  try:
    resp = await POST /claim-guest
    if resp.withheld:
      setClaimStatus('withheld')
      clearPendingGeneration()  // 强制丢弃
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

**倒计时归零**：自动刷 `/quota`，若 `remaining > 0` 关弹窗并恢复按钮。

**匿名 `remaining = 0`（或 linked）按钮态**：置灰；点击重开对应登录弹窗（不自动弹）。

### 6.3 倒计时 A11y

- 外层容器 `role="timer"`
- `aria-label` 只在**分钟边界**更新（`aria-label="剩余 5 分钟"` → `"剩余 4 分钟"`）
- 秒级数字变化用纯视觉动画，不触发 `aria-live`
- 避免 `aria-live="polite"` 每秒刷屏幕阅读器

### 6.4 Recent Generations 渲染策略

- 首屏：localStorage 缓存先绘（marked `pending-server-confirm`）
- 服务端响应到达：按 `id` diff：
  - localStorage 有 + server 有 → 原位更新
  - server 新增 → fade-in
  - localStorage 有 + server 无（被 GC 或跨设备差异） → fade-out
- 避免 localStorage 与服务端数据闪烁不一致

### 6.5 LoginModal 集成

**现状**：[src/components/auth/login-modal.tsx](src/components/auth/login-modal.tsx) 当前仅支持 Google OAuth，文案硬编码。

**v3 需求**：

- 支持 `reason` prop：`'anon_exhausted' | 'feature_gated' | 'anon_linked' | 'default'`
- 文案按 reason 切换（见 §附录 C i18n key 列表）
- `onSuccess` 回调触发 `claim-guest`（不是在 Better Auth hook 内）
- 若 OAuth 回跳导致 `onSuccess` 未触发，首页挂载补调兜底（§6.2 步骤 5）

### 6.6 iOS Safari ITP 特别说明

- `guest_id` cookie httpOnly → 穿越 ITP 安全
- 但 fingerprint 采集 / visitorId 常在 iOS Safari 严格模式下失败
- 预期 iOS 匿名用户**大概率**走降级路径：`visitorId` 为空，`abuseBindKey` 纯靠 IP+UA+locale
- 降级路径下容量仍为 5（abuseBindKey 本身是服务端派生，不因 visitorId 缺失而降级）
- 前端**不**对 iOS 用户显示降级提示，避免造成"iOS 体验差"的错觉

---

## §7 反薅与隐私

### 7.1 分层

| 层  | 机制                                                   | 强度                     |
| --- | ------------------------------------------------------ | ------------------------ |
| L1  | 模型白名单：仅 nano-banana                             | 硬                       |
| L2  | 功能白名单：仅 text-to-image；禁批量、多图、img2img    | 硬                       |
| L3  | 并发限制：同一 subject 最多 1 个 `pending`             | 硬                       |
| L4  | `abuseBindKey` 服务端派生，客户端不可控                | 中                       |
| L5  | `(IP + UA) hash` 路由处理器侧限流（5/min；降级 2/min） | 中                       |
| L6  | `linkedUserId` 阻断匿名消费，防 logout 重领            | 中                       |
| L7  | `claim-guest` 冲突检查，跨账号同设备 `withheld`        | 中                       |
| L8  | Idempotency-Key 防重放双扣                             | 中                       |
| L9  | Turnstile                                              | 预留，可疑流量触发时启用 |

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

可配置项（可选，有默认）：

- `HOME_IP_PREFIX_V4`：默认 `24`
- `HOME_IP_PREFIX_V6`：默认 `48`
- `HOME_ANON_RATE_LIMIT_PER_MIN`：默认 `5`
- `HOME_DEGRADED_RATE_LIMIT_PER_MIN`：默认 `2`（保留，当前 v3 不主动触发降级路径）

### 7.5 Edge runtime 约束

- HMAC 必须用 Web Crypto `subtle.sign('HMAC', ...)`，不能用 Node `crypto.createHmac`
- Rate limit **放在路由处理器**（`/api/home/image/*` 入口），**不放中间件**
  - 现有 [src/middleware.ts](src/middleware.ts) 的 matcher 已排除 `/api/`
  - Middleware 仅承担 `guest_id` cookie 签发，不承担限流
- Rate limit store：建议 Upstash Redis 或 Vercel KV；若项目暂无可用存储，先用内存 Map（单实例有效，Vercel 多实例下会误放行，作为首期 acceptable）

---

## §8 策略清单

### 8.1 退款策略（free quota）

| 情况                                    | 处理                                     |
| --------------------------------------- | ---------------------------------------- |
| Provider 5xx / 超时 / 内部异常          | 退（§4.4）                               |
| 内容审核 / 模型安全拒绝                 | 不退（防 prompt 探边界）                 |
| 用户主动取消                            | 不退                                     |
| 同步参数校验失败（model/features 非法） | 根本不扣                                 |
| Idempotency replay 命中旧请求           | 返回缓存响应，**不重复扣减，不重复退款** |

### 8.2 保留策略

| 对象                                             | 保留                                         |
| ------------------------------------------------ | -------------------------------------------- |
| `guest_generation` 未 claim（`user_id IS NULL`） | 7 天后 GC                                    |
| `guest_generation` 已 claim（`user_id` 非空）    | 永久保留                                     |
| `quota_bucket`                                   | **永不 GC**（`linked_user_id` 承担风控记忆） |

### 8.3 登录联动策略

- Claim 成功（无 withheld）：
  - `guest_generation.user_id` in-place 回填
  - `quota_bucket.linked_user_id` 回填（guest bucket）
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

| 阶段        | 内容                                                                                                                                                                                             | 验证方式                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| P1          | DB migration：`guest_generation` + `quota_bucket` + 所有索引 + FK onDelete                                                                                                                       | 手测脚本 + 验收清单                                               |
| P2          | `src/credits/free-quota.ts`：`deriveAbuseBindKey` / `lookupBucket` / `consumeFreeQuota` / `refundFreeQuota` / `claimGuest`；所有消费路径走事务 + 行锁 + 有界重试                                 | 手测脚本：模拟并发、模拟 linked、模拟 withheld                    |
| P3          | `src/image/utils/provider-submit.ts` 抽取（对齐 [src/image/utils/](src/image/utils/) 现有风格）+ `checkConcurrency` helper                                                                       | 回归现有 `/app` 功能不变                                          |
| P4          | 中间件：`guest_id` cookie 签发（Web Crypto），不加 rate limit                                                                                                                                    | 手测 cookie 签发/验证                                             |
| P5          | `/api/home/image/*` 五个端点 + Idempotency 存储                                                                                                                                                  | 手测：各错误码、idempotency replay、边界                          |
| P6          | Webhook 路由扩展：按 `providerRequestId` 路由到 `asset` 或 `guest_generation`                                                                                                                    | 手测 webhook 两种路径                                             |
| P7          | 前端：`use-home-generation` hook、Zustand store（claimStatus / inFlightJob）、sessionStorage pendingGeneration、三弹窗（image2、image3、anon_linked）、倒计时 A11y、Recent Generations 渲染 diff | 手测 E2E                                                          |
| P8          | 登录流程集成：LoginModal reason prop + 登录回调 claim + 首页挂载补调                                                                                                                             | 手测完整 claim 流程（含 withheld / 失败 / OAuth 回跳丢 callback） |
| P9          | 观测埋点：匿名耗尽率、linked 命中率、claim 成功率、退款率、iOS 降级占比；敲定埋点落点（PostHog / 自建 / console）                                                                                | 看板验证                                                          |
| P10         | GC cron（未 claim 7 天清理）；敲定运行宿主（Vercel Cron / 外部调度）                                                                                                                             | 手测 cron 触发                                                    |
| P11（可选） | 若 P1-P10 手测暴露回归风险较大，再引入 vitest + 补单测覆盖 `free-quota.ts` 的并发路径                                                                                                            | vitest 通过                                                       |

**测试策略（§0 硬规则外的重申）**：

- 阶段 1（P1-P10）：**手测脚本 + 验收清单**，不假设已有测试框架
- 阶段 2（P11，可选）：若暴露并发/状态机回归风险，引入 vitest 补关键路径
- 不把"单元测 / 集成测通过"写作默认前提

---

## §10 待敲定小点（已收口）

| #   | 议题                                     | 默认值                                                     |
| --- | ---------------------------------------- | ---------------------------------------------------------- |
| 1   | IP prefix 粒度                           | IPv4 `/24`、IPv6 `/48`；可配置                             |
| 2   | 测试框架                                 | 先手测，必要时 vitest                                      |
| 3   | `visitorId` 角色                         | 仅风控信号，不进 HMAC，不作为身份                          |
| 4   | Claim 触发路径                           | 前端回调 + 首页挂载补调，不依赖 Better Auth hook           |
| 5   | Rate limit 位置                          | 路由处理器侧，非 middleware                                |
| 6   | Rate limit store                         | Upstash Redis / Vercel KV 首选；暂无可用存储时 P1 内存 Map |
| 7   | 监控落点                                 | P9 敲定（PostHog / 自建 log / 先 stdout）                  |
| 8   | GC cron 宿主                             | P10 敲定（Vercel Cron / 外部调度）                         |
| 9   | `withheld` 文案与 CTA                    | 产品侧确认后回填 §附录 C                                   |
| 10  | `guest_generation` 接 webhook vs polling | 两者皆要（§5.6），不 either/or                             |

---

## 附录 A：与现有代码的集成点

| 现有文件                                                                                                     | 集成方式                                                                                                             |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| [src/db/schema.ts](src/db/schema.ts)                                                                         | 新增两张表；沿用现有 camelCase-JS + snake_case-SQL 风格；`status` 用 `text` 不用 `pgEnum`                            |
| [src/app/api/image-generation/submit/route.ts](src/app/api/image-generation/submit/route.ts)                 | **不改**                                                                                                             |
| [src/app/api/image-generation/status/route.ts](src/app/api/image-generation/status/route.ts)                 | **不改**                                                                                                             |
| [src/app/api/image-generation/webhook/maxapi/route.ts](src/app/api/image-generation/webhook/maxapi)          | **扩展**：按 `providerRequestId` 路由 asset / guest_generation                                                       |
| [src/hooks/use-image-generation.ts](src/hooks/use-image-generation.ts)                                       | **不改**（/app 继续用）                                                                                              |
| [src/hooks/use-pending-generation.ts](src/hooks/use-pending-generation.ts)                                   | **不改**                                                                                                             |
| [src/components/blocks/hero/image-hero.tsx](src/components/blocks/hero/image-hero.tsx)                       | 切到新 `use-home-generation` hook                                                                                    |
| [src/components/blocks/hero/image-operation-panel.tsx](src/components/blocks/hero/image-operation-panel.tsx) | 按钮态、错误分支接入 home quota store                                                                                |
| [src/components/auth/login-modal.tsx](src/components/auth/login-modal.tsx)                                   | 加 `reason` prop；`onSuccess` 触发 `claim-guest`；文案 i18n 化                                                       |
| [src/components/auth/login-dialog.tsx](src/components/auth/login-dialog.tsx)                                 | 透传 `reason` prop                                                                                                   |
| [src/lib/fingerprint.ts](src/lib/fingerprint.ts)                                                             | **保留**（注册校验仍用），但不进首页 abuseBindKey                                                                    |
| [src/hooks/use-fingerprint.ts](src/hooks/use-fingerprint.ts)                                                 | **保留**；`visitorId` 走 risk signal 字段                                                                            |
| [src/lib/entitlements/fair-use.ts](src/lib/entitlements/fair-use.ts)                                         | **不改**；新增 `src/lib/entitlements/has-paid-capability.ts` 薄封装（orchestrates entitlement + credits + fair-use） |
| [src/actions/validate-registration.ts](src/actions/validate-registration.ts)                                 | **不改**                                                                                                             |
| [src/middleware.ts](src/middleware.ts)                                                                       | **扩展**：`guest_id` cookie 签发（Web Crypto HMAC）；rate limit 不放这里                                             |
| [src/credits/credits.ts](src/credits/credits.ts)                                                             | **不改**；并列新增 `src/credits/free-quota.ts`                                                                       |
| [src/lib/auth.ts](src/lib/auth.ts)                                                                           | **不改**；不添加幻觉 `onSignIn` hook                                                                                 |
| [src/lib/analytics/server.ts](src/lib/analytics/server.ts)                                                   | **待敲定**（P9）：当前 `trackServerEvent` 是 console stub，需决定是否接真实 sink                                     |

**新增目录建议**：

- `src/credits/free-quota.ts` — 免费额度服务层
- `src/image/utils/provider-submit.ts` — 共享 provider 调用（对齐现有 `src/image/utils/` 风格）
- `src/image/utils/concurrency.ts` — `checkConcurrency` helper
- `src/lib/entitlements/has-paid-capability.ts` — 付费能力统一判断
- `src/app/api/home/image/{submit,status,quota,recent,claim-guest}/route.ts` — 首页端点

**不使用 `src/services/` 目录**（非项目约定）。

---

## 附录 B：新增环境变量（需写入 `env.example`）

```
# === 首页免费额度系统 ===
ABUSE_BIND_SECRET=                    # HMAC 密钥，用于派生 abuseBindKey，独立于 auth secret
GUEST_ID_SIGNING_SECRET=              # HMAC 密钥，用于 guest_id cookie 签名

# 以下可选，均有默认值
HOME_IP_PREFIX_V4=24                  # 默认 /24
HOME_IP_PREFIX_V6=48                  # 默认 /48
HOME_ANON_RATE_LIMIT_PER_MIN=5        # 匿名正常路径限流
HOME_DEGRADED_RATE_LIMIT_PER_MIN=2    # 预留给未来降级路径
HOME_IDEMPOTENCY_TTL_SECONDS=60       # Idempotency-Key 缓存时长
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
```

文案 draft 需产品侧确认（特别是 `withheld` 与 `anon_linked` 两个新增语义）。

---

## 附录 D：验收清单（P1-P10 手测用）

### DB & 消费协议

- [ ] 匿名首次请求创建 bucket，remaining=5，policy=ANON_ONE_SHOT
- [ ] 匿名连续 5 次后第 6 次返回 `ANON_QUOTA_EXHAUSTED`
- [ ] 清 cookie 后重新请求，abuseBindKey 未变 → 命中同一 bucket（仍 0 remaining）
- [ ] 切换 UA（同 IP+locale）→ 新 bucket 5 remaining（已知 tradeoff）
- [ ] 登录后：新 user bucket 5 remaining，policy=USER_FREE_10MIN
- [ ] 用完 5 次 → `nextRefillAt = now+10min`，弹倒计时弹窗
- [ ] 10 分钟后自动恢复 5 remaining
- [ ] 已有 user bucket 的用户再次登录 → bucket 不被重置
- [ ] claim 返回 `withheld=true` 时：guest_generation 未被回填，user bucket 未创建
- [ ] Logout 同浏览器回匿名 → 返回 `ANON_BUCKET_LINKED_LOGIN_REQUIRED`
- [ ] Idempotency-Key 重放 60s 内返回缓存响应，quota 不变

### 并发

- [ ] 同 abuseBindKey 并发 10 个 submit：最多 5 个成功，其余 `CONCURRENT_LIMIT` 或 `ANON_QUOTA_EXHAUSTED`；无 bucket 双建
- [ ] 同 user 并发 claim：user bucket 只被创建一次（ON CONFLICT DO NOTHING）

### 前端

- [ ] `/quota` 响应含 `serverNow`，倒计时基于 offset（手改本机时间验证）
- [ ] `pendingGeneration` 落 sessionStorage，OAuth 跨标签跳转后 resubmit 成功
- [ ] claim `withheld=true` → pending 被清，不 resubmit
- [ ] 倒计时弹窗归零后自动刷 quota 并关闭
- [ ] `ANON_BUCKET_LINKED_LOGIN_REQUIRED` 弹窗文案与 `ANON_QUOTA_EXHAUSTED` 不同
- [ ] 刷新首页后，in-flight job 通过 `/status` 恢复按钮态
- [ ] Recent Generations 在 localStorage 有、server 无的情况下 fade-out

### 安全

- [ ] 客户端伪造 `visitorId`（每请求不同）不影响 abuseBindKey（HMAC 不含该字段）
- [ ] 客户端不传 `visitorId` → abuseBindKey 仍可派生（IP+UA+locale）
- [ ] 直接请求 `refund` 端点 → 404（未注册 HTTP 路由）
- [ ] `/api/home/image/*` 的原始 IP / UA 不落 DB，只查 `ip_prefix_hash` / `ua_hash`
- [ ] ABUSE_BIND_SECRET 未设 → 服务端启动报错（fail-fast）

### Webhook

- [ ] 匿名作业的 provider webhook 回调写入 `guest_generation`
- [ ] 登录作业的 webhook 写入 `asset`
- [ ] 跨表 `providerRequestId` 冲突 → 应用层拒绝（不会发生但要验证兜底）

---

**v3 定稿**。下一步：用户组织团队跑最后一轮精简 review（重点 DB + Security），出 sign-off 后开工。
