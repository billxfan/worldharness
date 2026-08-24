# WorldHarness

[English](README.md) | [简体中文](README.zh-CN.md)

[![CI](https://github.com/billxfan/worldharness/actions/workflows/ci.yml/badge.svg)](https://github.com/billxfan/worldharness/actions/workflows/ci.yml)

**一个让真实用户与 Agent 按照共同规则持续互动的开放 Harness Runtime。**

大多数 Agent 框架解决的是 Agent 如何推理、调用工具和完成任务。
WorldHarness 解决另一个问题：真实用户和他们的 Agent，如何在同一个上下文中共享状态、
遵守规则，并共同形成可信的互动历史。

这个上下文叫作 **World**。它可以是社区、对话、项目、市场、治理空间或游戏。
WorldHarness 不假设 World 必须是游戏，也不假设它必须拥有一个 Host Agent。

> 用户或 Agent 提出 Action，World 的 Protocol 决定这个 Action 意味着什么，
> Harness 将结果提交为所有参与者共享的 Event 事实。

## 为什么需要 WorldHarness？

让 Agent 调用一个 API 很容易，让它安全地参与共享环境要难得多：

- Agent 必须代表一个明确的用户，并且只能在授权范围内行动；
- 真实用户和 Agent 必须经过同一套规则；
- 一个请求只有在完成鉴权和提交之后，才能成为共同事实；
- 多个参与者同时操作时，需要明确的顺序和冲突语义；
- 模型调用、通知等外部任务失败时，不能破坏已经形成的共享状态。

WorldHarness 把这些约束收敛在一个小型 Runtime 中，避免社区、机器人、工作流和游戏
各自重复实现一套不一致的互动机制。

## 心智模型

```text
真实用户客户端 ─┐
                ├─> Action -> 鉴权 -> Protocol -> 提交 Event
用户的 Agent ───┘                                  |
                                                     +-> 查询视图
                                                     +-> 消息投递
                                                     +-> Agent 与异步任务
```

Agent 可以提出 Action，但不能直接修改 World 状态。

内核只保留四种领域记录：

| 记录 | 含义 |
| --- | --- |
| `Profile` | 用户的全局身份。 |
| `Agent` | 归属于 Profile、具有明确授权范围的代理执行者。 |
| `World` | 一组互动的边界，以及其中启用的 Protocol。 |
| `Membership` | Profile 在某个 World 中的展示身份、角色和参与状态。 |

Runtime 只增加三个概念：

| 概念 | 含义 |
| --- | --- |
| `Action` | Profile 或 Agent 希望执行什么。 |
| `Protocol` | 根据 World 规则处理 Action 的插件代码。 |
| `Event` | 已经由 Harness 提交、只能追加的事实记录。 |

内核中没有 `Character`、`Persona`、`Host`、`Message` 或 `Thread` 实体。
Membership 已经能够表达用户在特定 World 中的展示身份和角色。消息、帖子、投票、
Host 等概念属于真正需要它们的 Protocol。

## 当前已经实现什么

WorldHarness 目前版本为 `0.0.0`：它是可以运行的架构种子，还不是可用于生产环境的
Runtime。当前 TypeScript 实现没有运行时依赖，已经验证以下语义：

- Profile 与限定权限的 Agent 鉴权；
- 同时记录实际执行的 Agent 和它所代表的 Profile；
- 每个 World 独立启用 Protocol 命名空间；
- 基于执行者与 `Action.id` 的幂等重放，同一个逻辑 Action 重试时不会重复提交；
- Event Stream 级别的乐观并发控制；
- 内存存储中的多 Stream 原子提交；
- 同时具有 Stream 顺序和全局顺序、只能追加的 Event 记录；
- Middleware 与 Event Consumer；
- 支持显式释放的 Plugin 注册。

仓库中的 `MemoryDirectory` 和 `MemoryEventStore` 只用于示例与测试。
持久化存储、可靠异步任务、网络适配器和不可信插件隔离还没有实现。

## 运行示例

环境要求：Node.js 22 或更高版本。

```bash
git clone https://github.com/billxfan/worldharness.git
cd worldharness
npm install
npm run example
```

示例会创建一个 Profile、一个代表该 Profile 行动的 Agent、一个 World 和一条
Membership。Agent 提交 `community.post`，Harness 完成授权校验，并提交包含执行者归属
和因果 ID 的 `community.posted`。

对于同一个执行者，`Action.id` 必须唯一标识一个逻辑 Action，不能用不同的 World、类型
或 Payload 重用。重放时，Harness 会返回这个 ID 首次成功提交的结果。

运行全部本地检查：

```bash
npm run check
```

## 编写一个 Protocol

Protocol 是注册命名空间 Action Handler 的 Plugin。Handler 读取当前 Event Stream，
然后返回 Event Draft；它不直接写存储，也不直接调用外部服务。

```ts
import { accept, reject, type Plugin } from "worldharness"

interface SendPayload {
  text: string
}

export const chatProtocol: Plugin = ({ registerAction }) => {
  registerAction("chat.send", async (context, action) => {
    const payload = action.payload as Partial<SendPayload>
    const text = payload.text?.trim()

    if (!text) return reject("invalid_message", "Message text is required")

    const streamId = `world:${action.worldId}:chat`
    await context.read(streamId)

    return accept({
      streamId,
      type: "chat.sent",
      data: {
        messageId: action.id,
        author: context.authorization.membership.displayName,
        text,
      },
    })
  })
}
```

将它安装到 Harness：

```ts
const dispose = harness.install(chatProtocol)

// 之后调用：执行这个 Plugin 已注册的清理函数。
await dispose()
```

## Agent 授权如何工作

每个 Agent 归属于一个 Profile，并拥有明确的 Action Scope：

```ts
const agent = {
  id: "agent:codex",
  ownerProfileId: "profile:kobe",
  provider: "codex",
  scopes: ["chat.*"],
}
```

Agent 提交 Action 时，Authorizer 会检查 Agent 是否存在、是否过期或已撤销、Scope 是否
匹配、目标 World 是否有效、对应 Protocol 是否启用，以及 Agent 所有者是否具有有效的
Membership。最终提交的 Event 会同时记录两种身份：

```ts
actor: {
  type: "agent",
  id: "agent:codex",
  profileId: "profile:kobe",
}
```

这样，“这个行为属于谁”和“实际由什么执行”就是两个不同的问题。

## Plugin 扩展面

当前 Plugin 只有三个扩展点：

```text
registerAction  处理一种带命名空间的 Action
use             使用 Middleware 包裹 Action Pipeline
onEvent         观察已经提交的 Event
```

当前进程内 Plugin 都是受信任代码。Plugin 生命周期清理不是安全隔离边界。
在真正支持不可信 Protocol 之前，需要增加独立进程或 WebAssembly 沙箱。

## 下一步方向

接下来的里程碑保持克制：

1. 稳定 Action 与 Event Envelope。
2. 明确 EventStore 的顺序、并发和重放语义。
3. 增加持久化 EventStore Provider 和可靠的 Consumer Loop。
4. 发布用于验证替代 Provider 的一致性测试套件。
5. 增加第一个网络 Adapter 和端到端示例。

论坛、聊天、治理、内容审核、发现和 Host Agent 应该作为 Protocol 或 Consumer 实现，
而不是继续增加内核概念。

## 项目结构

```text
src/types.ts          领域记录与 Action/Event Envelope
src/authorization.ts  Profile、Agent、World、Membership 鉴权
src/harness.ts        Dispatch Pipeline 与 Plugin 生命周期
src/store.ts          EventStore 接口与内存实现
examples/             可运行的 Protocol 示例
test/                 Runtime 语义测试
docs/architecture.md  架构边界与设计理由
```

## 文档

- [架构设计（英文）](docs/architecture.md)
- [贡献指南（英文）](CONTRIBUTING.md)
- [安全策略（英文）](SECURITY.md)
- [English README](README.md)

## 参与贡献

WorldHarness 还处于很早期。相比增加庞大的抽象，一个能够证明当前模型不足的具体案例
更有价值。在增加新的内核实体之前，请先解释为什么这个需求不能由现有字段、Event、
Plugin 或 Provider 表达。

请从 [CONTRIBUTING.md](CONTRIBUTING.md) 开始。

## 许可证

[Apache License 2.0](LICENSE)
