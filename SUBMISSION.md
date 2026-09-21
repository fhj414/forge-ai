# Forge AI — Atoms Demo 笔试说明

## 交付信息

- **在线 Demo：** [https://forge-ai.fuhaojun.com](https://forge-ai.fuhaojun.com)
- **GitHub：** [https://github.com/fhj414/forge-ai](https://github.com/fhj414/forge-ai)
- **访问方式：** 公网匿名访问，无需注册或登录
- **默认模型：** `qwen/qwen3.5-35b-a3b:nitro`（通过 OpenRouter 调用）
- **技术栈：** Next.js App Router、React、TypeScript、Zod、Vitest、Testing Library；部署于 Vercel
- **最近验收：** 2026-09-21，Node.js `v22.23.2`

Forge AI 是一个端到端的 AI Web App Builder。用户可以用自然语言描述产品，观察真实生成过程，在隔离的 Preview 中运行生成结果，继续对话修改代码，并在发现运行时错误后显式请求 AI 修复。

公开 Demo 有意省略账户系统，让评审可以直接进入核心流程。页面中的 `Local autosave` 指 Forge 工作区的项目、源码、对话和版本保存在当前浏览器；它不代表生成应用内部的临时业务数据会跨刷新保留。

核心闭环为：

```text
Generate → Validate → Preview → Check → Repair → Re-check
```

## 60 秒体验路径

1. 打开在线 Demo，无需注册，选择 `Expense Tracker` 或 `Task Manager` 示例。
2. 点击 Generate，观察与真实请求阶段对应的 Agent 执行时间线；模型响应通常需要数十秒。
3. 在 Preview 中新增数据、切换筛选器或任务状态，确认生成结果具备真实交互。
4. 切换 Desktop、Tablet、Mobile，检查不同宽度下的 Preview。
5. 切换到 Code，编辑 HTML、CSS 或 JavaScript，点击 `Apply changes`。
6. 打开 Versions，查看刚刚产生的修改前快照，并尝试 Restore。
7. 点击 `Download HTML`，获得可以脱离 Forge 独立运行的单文件应用。

如需演示完整自动检测与修复链路：在 JavaScript 编辑器中加入一个明确的运行时错误并 Apply，Preview Health 会显示诊断；点击 `Ask AI to fix` 后，Forge 会携带当前源码与有限诊断信息发起修复，保存修复前快照，并对新 Preview 再次执行健康检查。

## 实现思路

### 1. 先完成可靠闭环，而不是追求最大技术规模

本项目面向 6–8 小时时间盒进行产品取舍。与其搭建依赖安装、构建和容器运行都不稳定的完整 React 生成环境，我选择让模型生成受约束的 HTML、CSS 和原生 JavaScript。

这一选择仍然覆盖了 AI Builder 最关键的产品体验：生成、执行、交互、修改、持久化、诊断、修复、回滚和导出，同时显著降低模型输出不完整、依赖版本冲突和冷启动失败的概率。

### 2. 生成结果必须经过边界验证

服务端 API 负责注入独立的系统提示词，通过 OpenRouter 调用模型，并对返回结果进行：

- Markdown fence 清理与 JSON 提取
- Zod Schema 校验
- HTML、CSS、JavaScript 长度限制
- 单一 55 秒请求预算
- 有限的瞬时故障重试
- 结构化错误码映射

API Key 仅存在于服务端环境变量中，不会进入浏览器、项目数据、版本快照或导出的 HTML。

### 3. 生成代码必须隔离运行

生成应用运行在 sandboxed iframe 中：

```html
sandbox="allow-scripts allow-forms"
```

Preview 不启用 `allow-same-origin`，并通过 CSP 禁止网络连接、外部资源和表单导航。Forge 提供隔离的内存 Storage 兼容层以及原生 Canvas Chart 兼容层，使常见 Demo 可以交互，同时不放宽宿主应用的安全边界。

### 4. Preview Health 形成 AI Native 修复闭环

每次 Preview 渲染都会在生成代码执行前安装诊断运行时，捕获：

- 是否渲染出有效内容
- 控件和表单数量
- 未捕获 JavaScript 异常
- 未处理 Promise rejection

父页面只接受来自当前 iframe、当前 opaque session 的有界消息。健康检查不会自动点击、提交表单或判断业务逻辑，也不会自动产生模型费用。

只有用户点击 `Ask AI to fix` 后，Forge 才会把当前源码与标准化诊断发送给模型。修复成功前先保存旧版本；修复失败则保留当前 Preview、源码与版本历史。

### 5. Local-first 持久化

项目、当前选择、对话、源码、生成元数据和最近十个历史版本保存在浏览器 localStorage 中。Storage 被封装在独立适配层后面，因此未来可以替换为 Supabase 或 PostgreSQL，而不需要改写生成与 Preview 流程。

这里有两个刻意分开的状态边界：Forge 工作区数据会在同一浏览器内持久化；生成应用运行在隔离 iframe 中，其 Storage 兼容层当前是内存实现，Preview 内新增的任务等运行时数据不会承诺跨刷新保留。这避免生成代码访问宿主页面的真实存储。

## 当前完成程度

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| 初始化与使用入口 | 已完成 | 公网匿名访问，示例可一键填入，无需注册 |
| 自然语言生成应用 | 已完成 | 支持示例和自定义 Prompt |
| 请求关联的执行时间线 | 已完成 | 阶段与请求、校验和 Preview 更新对应，并非虚构进度条 |
| 可交互 Preview | 已完成 | 表单、按钮、筛选和 Canvas 图表可运行 |
| 响应式预览 | 已完成 | Desktop、Tablet、Mobile 三种宽度 |
| 工作区数据持久化 | 已完成 | 项目、对话、代码、版本和元数据保存在当前浏览器 |
| 对话式 Refinement | 已完成 | 携带当前源码增量修改，而非重新生成 |
| Code 在线编辑 | 已完成 | HTML/CSS/JS、Apply、Discard、复制、未保存提示、快捷键 |
| 版本历史 | 已完成 | 最近十个快照、来源标签、一键 Restore |
| Preview Health | 已完成 | 运行时检测、结构信息、超时/不可用/重试状态 |
| AI 一键修复 | 已完成 | 显式触发、修复前快照、失败不破坏现有结果 |
| 生成元数据 | 已完成 | 模型、耗时、行数、字节数、Schema 状态 |
| 独立 HTML 导出 | 已完成 | 下载后可直接打开，不包含 API Key |
| 注册与云端同步 | 未实现 | 当前使用 local-first，不提供账户或跨设备同步 |
| Preview 业务数据持久化 | 未实现 | 生成应用内部状态为隔离的当前运行时数据 |
| 流式模型输出 | 未实现 | 当前为 request/response，UI 展示真实阶段状态 |
| 多文件 React/npm 运行环境 | 未实现 | 选择更可靠的单文档生成契约 |
| 生成应用一键部署 | 未实现 | 当前优先提供稳定的独立 HTML 导出 |

## 关键取舍

### HTML/CSS/JavaScript，而不是 WebContainer

WebContainer 或 Sandpack 可以提供更接近真实工程的多文件体验，但会引入依赖解析、安装、构建、包兼容和长冷启动。在本次时间盒中，我优先保证完整主流程与生成结果的成功率。

### Local-first，而不是先做登录系统

题目要求数据持久化，但不限定云端方案。localStorage 可以以更低复杂度完成真实持久化，并让时间集中在 AI Builder 的差异化体验上。Storage adapter 已经为后续云端迁移保留清晰边界。

### 显式修复，而不是自动循环

自动发现问题后立即调用模型会产生不可控费用和修复循环。Forge 将检测与修复分开：系统自动报告问题，用户决定是否消费模型额度，并且始终可以恢复旧版本。

### 保留最后一个有效版本

网络、模型、超时和 Schema 错误都只更新错误状态，不清空当前应用。无论生成还是修复失败，用户都可以继续查看和编辑最后一个有效结果。

## 工程质量与验证

以下结果于 2026-09-21 使用 Node.js `v22.23.2` 重新执行：

| 检查 | 命令或路径 | 结果 |
| --- | --- | --- |
| 自动化测试 | `npm test` | 17 个测试文件、91 个测试全部通过 |
| 静态检查 | `npm run lint` | 通过，无 ESLint 错误 |
| 生产构建 | `npm run build` | Next.js 编译、TypeScript 检查和静态页面生成通过 |
| Diff 格式 | `git diff --check` | 通过 |
| 线上冒烟测试 | 在线 Demo 的 `Task Manager` 示例 | 匿名生成成功，Schema validated，Preview healthy |

线上实测的一次生成耗时约 24,990 ms，模型为 `qwen/qwen3.5-35b-a3b:nitro`；该数字仅是本次验收样本，不代表平均延迟或可用性 SLA。生成的任务应用可新增、完成、筛选和删除任务；刷新后 Forge 项目及源码仍在，而 Preview 内临时新增的任务会重置，与上文描述的状态边界一致。

自动化测试覆盖 API 请求、Schema、持久化、版本恢复、代码编辑、导出、Preview Health 和显式 AI 修复。线上耗时和生成质量会随模型服务状态及 Prompt 变化，`Preview healthy` 也只代表当前渲染与有限运行时检查通过，不等于完整业务、视觉或无障碍验收。

## 如果继续投入时间

### P0：提升生成反馈和代码可靠性

1. 使用流式结构化输出，让用户更早看到模型响应和生成进度。
2. 增加 JavaScript 静态语法校验、危险 HTML 检查和生成前后的自动质量门。
3. 增加生产侧请求追踪、模型耗时分布和失败原因统计。
4. 为公开生成接口增加限流、额度和滥用保护。

### P1：从单设备 Demo 升级为可持续产品

1. 增加身份认证、云端项目存储和跨设备同步。
2. 增加完整项目备份导入/导出，包括源码、消息、元数据和历史版本。
3. 增加可复现的交互测试步骤与截图回归。

### P2：扩展生成能力

1. 引入 Sandpack/WebContainer，支持多文件 React 和受控 npm 依赖。
2. 增加 GitHub 同步和生成应用一键部署。
3. 增加可视化元素选择、局部 Prompt 修改和直接操作界面。
4. 在基础链路稳定后，再拆分 Planner、Builder、Reviewer 等专业 Agent 角色。

优先级原则是：先提高核心链路的速度、可观测性和成功率，再增加云端协作能力，最后扩展运行时复杂度。

## AI Coding 工具使用说明

- **Codex：** 公司账户套餐约 USD 200/月；个人 ChatGPT Plus 约 USD 20/月
- **Cursor：** USD 20/月

AI 主要用于需求拆解、实现、测试生成、浏览器验收和代码审查。关键架构取舍、边界定义、失败处理和最终验收由人工确认；模型生成内容必须经过测试、构建与实际交互验证后才进入交付版本。

如需提供账单截图，将通过招聘文档或 HR 私下提交；为避免泄露账户、订单或支付信息，不把账单图片提交到公开 GitHub 仓库。

## 提交回收清单

- [x] 笔试说明文档：本文件 `SUBMISSION.md`
- [x] 已部署的可测试链接：[https://forge-ai.fuhaojun.com](https://forge-ai.fuhaojun.com)
- [x] GitHub 代码链接：[https://github.com/fhj414/forge-ai](https://github.com/fhj414/forge-ai)
- [x] AI Coding 工具与费用说明
- [ ] 可选账单凭证：如提交，仅通过私密渠道提供脱敏版本
