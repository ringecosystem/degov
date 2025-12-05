# ClockMode / BlockData 统一评审报告

## 范围与目的
- 涵盖文件：`src/hooks/useClockMode.ts`、`src/contexts/ClockModeContext.tsx`、`src/hooks/useGovernanceParams.ts`、`src/hooks/useSmartGetVotes.ts`、`src/contexts/BlockContext.tsx`。
- 目标：统一依赖与问题结论，给出可执行的优化路线与自检清单，避免信息分散或结论冲突。

## 主要数据链与依赖矩阵
**功能依赖表**
| 数据/调用 | 提供方 | 直接消费者 | 用途 |
| --- | --- | --- | --- |
| `CLOCK_MODE` 常量 | `useClockMode`（`readContract`） | `ClockModeContext`、`useSmartGetVotes` | 判定 blocknumber / timestamp 模式 |
| `clock()` 时间点 | `useSmartGetVotes` | 同左 | 时间戳模式下获取快照参数 |
| `clock()` 时间点 | `useQuorum` (`useGovernanceParams`) | 同左 | 时间戳模式下作为 `quorum()` 参数 |
| 平均出块时间 `blockInterval` | `BlockContext` (`useBlockInterval`) | `useStaticGovernanceParams` | 区块模式下把 votingDelay/votingPeriod 转秒 |
| 全局遮罩 `"clock"` key | `ClockModeContext`（`useBlockData.isLoading` + `useClockMode.isLoading`） | `GlobalLoadingProvider` | 控制初始化遮罩 |

**包装关系表**
| 组件/Hook | 依赖 | 被谁使用 |
| --- | --- | --- |
| `useClockMode` | `useDaoConfig`、`wagmi readContract` | `ClockModeContext`、`useSmartGetVotes` |
| `ClockModeContext` Provider | `useClockMode`、`useBlockData`、`useGlobalLoading` | `useGovernanceParams`（经 `useClockModeContext`） |
| `useClockModeContext` | React Context | `useGovernanceParams` |
| `BlockProvider` | `wagmi getBlock` 采样 | 顶层 `ConfigProvider` 包裹，向所有消费 `useBlockData`/`useBlockInterval` 的逻辑供给 |
| `GlobalLoadingProvider` | — | 顶层包裹，接收 `"clock"`、`"config"` 等加载 key |

**数据链概要**
- BlockContext 采样 10 个区块计算平均出块时间 `blockInterval`（预估耗时 1-3s，取决于 RPC）。  
- ClockModeContext 合并 clock 与 block 的 loading 写入全局遮罩 `"clock"`；未提供 blockInterval。  
- useStaticGovernanceParams 在 block 模式将治理参数区块数换算秒；downstream：`app/_components/parameters.tsx`、`components/system-info.tsx`、`useMyVotes.ts`（用于阈值判断）。  
- useQuorum / useSmartGetVotes 在 timestamp 模式各自读取 `clock()`；在 block 模式使用 blockNumber。

## 现状问题与风险
- Context 透传未记忆化：`ClockModeProvider` 的 `value` 未 `useMemo`，父级重渲染会导致消费者额外渲染。
- 字段不一致：`useQuorum` 解构 `clockModeError`，但 Context 未提供该字段。
- `clock()` 重复请求：时间戳模式下 `useSmartGetVotes` 与 `useQuorum` 各自请求一次，可合并。
- 遮罩耦合单点：去除 ClockModeContext 会丢失 `"clock"` loading，需迁移。
- **硬编码 fallback 12s 风险**：`useStaticGovernanceParams` 在 block 模式用 `averageBlockTime || 12`；当链出块时间明显偏离 12s 时，投票窗口显示严重失真且用户无感知，产品不可接受。
- 日志噪声：`GlobalLoadingContext` 中存在无用 `console.log("_", _)`。

## 优化方案（按优先级）
**P0 消除错误或误导**
1) 去掉硬编码 `fallbackBlockTime=12`：blockTime 不可用时直接返回 `null`，UI 显示“待获取”或 Skeleton；如需兜底，改为可配置且在 UI 明示“估算值”。  
2) 统一 `clock()` 查询：抽 `useGovernorClock`（React Query）供 `useQuorum` 与 `useSmartGetVotes` 复用，减少请求并集中错误处理。  
3) 修正 Context 不一致：`ClockModeProvider` 的 value 用 `useMemo`；要么补充 `clockModeError`，要么在 `useQuorum` 移除该解构。

**P1 体验与性能**
4) 迁移/解耦遮罩逻辑：若保留 Context，可只用 `clock` 的 loading；若移除 Context，在顶层 Hook 合并 `clockLoading || blockLoading` 写入 `"clock"`。  
5) 可选降低采样：将 `BLOCK_SAMPLE_SIZE` 从 9 降为 2-3，减少加载时长，接受轻微精度损失（仅展示层）。  

**路径指引**
- 保守路径（保留 Context）：执行 1/2/3/4(简化)；视需求执行 5。  
- 精简路径（移除 Context）：`useGovernanceParams` 直接用 `useClockMode`，迁移遮罩逻辑，执行 1/2/3(移除解构)，视需求执行 5。

## 自检清单
- [ ] block 模式下秒级展示不再使用硬编码 12s；缺值时文案明确。  
- [ ] timestamp 模式 `clock()` 只请求一次（共享 Hook）。  
- [ ] `ClockModeProvider` value 记忆化；`clockModeError` 与上下游一致或删除解构。  
- [ ] 遮罩逻辑仍按预期工作（有/无 Context 方案）。  
- [ ] 运行 `pnpm lint && pnpm test`。  

## 决策建议
- 若以最小改动为先：修正 Context（useMemo、字段）、合并 `clock()` 请求，移除硬编码 fallback，并保持遮罩；可选降低采样。  
- 若想精简结构：拆掉 ClockModeContext，直用 `useClockMode`，在顶层迁移遮罩并共享 `clock()` 请求，同时移除硬编码 fallback。  

> 结论：`fallbackBlockTime=12` 不应作为默认兜底；无真实 blockTime 时应显示“待获取”或使用可配置且明示的估算值。其它依赖结论与原文一致。
