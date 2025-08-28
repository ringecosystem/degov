# 图标系统重构文档

## 项目背景

原系统为了支持暗黑/明亮模式，采用了 `dark:hidden` 和 `hidden dark:block` 的双图片方案，这种方案存在以下问题：
- 每个图标需要维护两份文件（light/dark版本）
- 不支持多主题扩展（计划支持8个主题）
- 代码冗余，维护成本高
- 图片文件体积大

## 解决方案

将所有SVG图标转换为React组件，使用 `currentColor` 实现自动主题适配。

## 技术架构

### 核心类型定义
```typescript
// /src/components/icons/types.ts
import { SVGProps } from 'react';

export interface IconProps extends SVGProps<SVGSVGElement> {}

export const getIconProps = ({ width = 24, height = 24, ...props }: IconProps) => {
  return { width, height, ...props };
};
```

### 图标组件模板
```typescript
// 示例: /src/components/icons/example-icon.tsx
import { IconProps, getIconProps } from './types';

export const ExampleIcon = (props: IconProps) => {
  const svgProps = getIconProps(props);
  
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...svgProps}>
      <path d="..." fill="currentColor" />
    </svg>
  );
};
```

## 已创建的图标组件

### 基础图标 (13个)
- `LogoIcon` - 项目logo
- `ExternalLinkIcon` - 外部链接
- `CloseIcon` - 关闭/取消
- `PlusIcon` - 添加/新增
- `AppIcon` - 应用图标
- `ProfileIcon` - 用户头像
- `QuestionIcon` - 问号/帮助
- `MoreIcon` - 更多选项菜单
- `CancelIcon` - 取消/删除
- `ErrorIcon` - 错误/失败
- `ClockIcon` - 时钟/等待
- `DiscussionIcon` - 讨论/对话
- `WarningIcon` - 警告/提醒

### 导航图标 (6个)
- `DashboardIcon` - 仪表盘
- `ProposalsIcon` - 提案
- `TreasuryIcon` - 财库
- `DelegatesIcon` - 代表
- `ProfileNavIcon` - 导航中的个人资料
- `AppsIcon` - 应用菜单

### 社交媒体图标 (5个)
- `XIcon` - Twitter/X
- `TelegramIcon` - Telegram
- `EmailIcon` - 邮件
- `DocsIcon` - 文档
- `GithubIcon` - GitHub

### 提案相关图标 (6个)
- `ProposalCloseIcon` - 关闭提案
- `ProposalPlusIcon` - 新增提案
- `ProposalActionCheckIcon` - 确认/通过
- `ProposalActionCancelIcon` - 取消提案
- `VoteForIcon` - 投赞成票
- `VoteAgainstIcon` - 投反对票

### 其他图标 (2个)
- `NotFoundIcon` - 404/未找到
- `EmptyIcon` - 空状态

**总计: 32个图标组件**

## 动态图标映射系统

### 导航图标映射
```typescript
// /src/components/icons/nav-icon-map.tsx
export const NavIconMap: Record<string, React.ComponentType<IconProps>> = {
  dashboard: DashboardIcon,
  proposals: ProposalsIcon,
  treasury: TreasuryIcon,
  delegates: DelegatesIcon,
  profile: ProfileNavIcon,
  apps: AppsIcon,
};

export const getNavIcon = (iconName: string) => {
  return NavIconMap[iconName] || DashboardIcon;
};
```

### 社交图标映射
```typescript
// /src/components/icons/social-icon-map.tsx
export const SocialIconMap: Record<string, React.ComponentType<IconProps>> = {
  x: XIcon,
  twitter: XIcon,
  telegram: TelegramIcon,
  email: EmailIcon,
  docs: DocsIcon,
  github: GithubIcon,
};

export const getSocialIcon = (socialName: string) => {
  return SocialIconMap[socialName] || XIcon;
};
```

### 提案动作图标映射
```typescript
// /src/components/icons/proposal-actions-map.tsx
export const ProposalActionIconMap: Record<string, React.ComponentType<IconProps>> = {
  proposal: ProposalsOutlineIcon,
  transfer: TransferOutlineIcon,
  custom: CustomOutlineIcon,
  xaccount: CrossChainOutlineIcon,
  preview: PreviewOutlineIcon,
};

export const getProposalActionIcon = (actionType: string) => {
  return ProposalActionIconMap[actionType] || ProposalsOutlineIcon;
};
```

## 文件替换记录

### ✅ 第一轮替换 (7个文件)
1. `social-links.tsx` - 社交媒体图标
2. `action-table-summary.tsx` - 提案动作图标和外链图标
3. `dropdown.tsx` - 更多菜单和取消图标
4. `current-votes.tsx` - 检查/错误图标
5. `user.tsx` - 外链图标
6. `action-group-display.tsx` - 时钟、检查、错误、取消图标
7. `ai-analysis-standalone.tsx` - 外链图标

### ✅ 第二轮替换 (5个文件)
1. `sidebar.tsx` - Plus图标
2. `proposals.tsx` - Discussion图标和Plus图标
3. `proposals/page.tsx` - Plus图标
4. `proposals/new/page.tsx` - 两个Plus图标实例
5. `treasury/page.tsx` - ExternalLink图标和Warning图标

### ⏳ 待处理文件 (2个)
这些文件包含复杂的自定义logo逻辑，需要特殊处理：
1. `mobile-header.tsx` - 自定义logo双图片逻辑
2. `aside.tsx` - 自定义logo双图片逻辑

## 使用方法

### 基本用法
```tsx
import { ExternalLinkIcon } from '@/components/icons';

// 基础使用
<ExternalLinkIcon width={24} height={24} className="text-current" />

// 自定义样式
<ExternalLinkIcon 
  width={16} 
  height={16} 
  className="text-muted-foreground hover:text-foreground transition-colors" 
/>
```

### 动态图标使用
```tsx
import { getNavIcon } from '@/components/icons/nav-icon-map';

const IconComponent = getNavIcon('dashboard');
return <IconComponent width={24} height={24} className="text-current" />;
```

### 主题适配
图标会自动继承父元素的文本颜色，通过Tailwind CSS类可以灵活控制：
```tsx
// 继承当前文本颜色
<ExternalLinkIcon className="text-current" />

// 使用特定颜色
<ExternalLinkIcon className="text-blue-500" />

// 使用主题颜色
<ExternalLinkIcon className="text-muted-foreground" />
<ExternalLinkIcon className="text-foreground" />
```

## 替换前后对比

### 替换前
```tsx
<>
  <Image
    src="/assets/image/light/external-link.svg"
    alt="external-link"
    width={16}
    height={16}
    className="dark:hidden"
  />
  <Image
    src="/assets/image/external-link.svg"
    alt="external-link"
    width={16}
    height={16}
    className="hidden dark:block"
  />
</>
```

### 替换后
```tsx
<ExternalLinkIcon
  width={16}
  height={16}
  className="text-muted-foreground"
/>
```

## 优势

1. **主题兼容性**: 使用`currentColor`自动适配所有主题
2. **性能优化**: React组件比图片文件更轻量
3. **维护简化**: 每个图标只需维护一个组件
4. **类型安全**: 完整的TypeScript支持
5. **灵活性**: 支持所有SVG属性和CSS样式
6. **可扩展性**: 轻松添加新图标和新主题

## 文件结构

```
src/components/icons/
├── types.ts                    # 核心类型定义
├── index.ts                    # 统一导出
├── nav-icon-map.tsx           # 导航图标映射
├── social-icon-map.tsx        # 社交图标映射
├── proposal-actions-map.tsx   # 提案动作图标映射
├── logo-icon.tsx             # 基础图标
├── external-link-icon.tsx    # ...
├── nav/                      # 导航图标文件夹
│   ├── dashboard-icon.tsx
│   ├── proposals-icon.tsx
│   └── ...
├── social/                   # 社交图标文件夹
│   ├── x-icon.tsx
│   ├── telegram-icon.tsx
│   └── ...
└── proposal-actions/         # 提案动作图标文件夹
    ├── transfer-outline-icon.tsx
    ├── custom-outline-icon.tsx
    └── ...
```

## 开发服务器状态

✅ 所有替换都成功编译，开发服务器运行正常

## 后续工作

1. **处理复杂logo逻辑** - mobile-header.tsx 和 aside.tsx 中的自定义logo
2. **清理冗余文件** - 删除不再使用的图片文件
3. **主题测试** - 确保所有图标在不同主题下正确显示
4. **文档完善** - 添加更多使用示例和最佳实践

## 更新日志

### 2024年最后一次更新
- 完成12个文件的图标替换
- 创建32个图标组件
- 建立动态图标映射系统
- 从14个文件减少到2个文件包含dark:hidden模式
- 为支持8个主题奠定基础

---

*此文档会持续更新，记录所有图标系统相关的变更和改进。*