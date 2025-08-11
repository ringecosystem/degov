# 设备路由系统使用指南

## 🎯 系统概述

基于页面宽度的设备路由系统，根据屏幕尺寸自动切换不同的布局组件。

## 📱 设备类型

### 移动端 (< 768px)
- 使用 `MobileLayout` 组件
- 紧凑的头部设计
- 侧滑菜单导航
- 触摸优化的交互

### 平板端 (768px - 1024px)
- 使用 `MobileLayout` 组件
- 与移动端相同的布局
- 更大的触摸区域

### 桌面端 (> 1024px)
- 使用 `DesktopLayout` 组件
- 完整的侧边栏导航
- 搜索栏集成
- 传统的桌面布局

## 🏗️ 架构组件

### 1. 设备检测 Hook (`useDeviceDetection`)
```typescript
const { deviceType, isMobile, isTablet, isDesktop, isClient } = useDeviceDetection();
```

**功能特性：**
- 实时监听窗口大小变化
- 服务端渲染兼容
- 防抖优化

### 2. 设备路由组件 (`DeviceRouter`)
```typescript
<DeviceRouter>
  {children}
</DeviceRouter>
```

**路由逻辑：**
- 服务端渲染时默认显示桌面端布局
- 客户端渲染后根据设备类型切换
- 避免布局闪烁

### 3. 布局组件

#### 移动端布局 (`MobileLayout`)
- 紧凑的头部设计
- 汉堡菜单导航
- 全屏内容区域
- 触摸友好的按钮尺寸

#### 桌面端布局 (`DesktopLayout`)
- 传统的侧边栏布局
- 完整的头部组件
- 搜索栏集成
- 响应式内容区域

## ⚙️ 配置管理

### 设备配置 (`DEVICE_CONFIG`)
```typescript
export const DEVICE_CONFIG = {
  breakpoints: {
    mobile: 768,
    tablet: 1024,
    desktop: 1024,
  },
  features: {
    mobile: {
      sidebar: false,
      searchBar: false,
      compactHeader: true,
      touchOptimized: true,
    },
    // ...
  },
  layout: {
    mobile: {
      headerHeight: "h-14",
      contentPadding: "p-4",
      maxWidth: "max-w-full",
    },
    // ...
  },
};
```

## 🚀 使用方法

### 1. 基本使用
```typescript
// 在 layout.tsx 中使用
import { DeviceRouter } from "@/components/device-router";

export default function Layout({ children }) {
  return <DeviceRouter>{children}</DeviceRouter>;
}
```

### 2. 条件渲染
```typescript
// 在组件中使用设备检测
import { useDeviceDetection } from "@/hooks/useDeviceDetection";

function MyComponent() {
  const { isMobile, isDesktop } = useDeviceDetection();
  
  return (
    <div>
      {isMobile && <MobileVersion />}
      {isDesktop && <DesktopVersion />}
    </div>
  );
}
```

### 3. 样式适配
```typescript
// 使用配置中的样式类
import { DEVICE_CONFIG } from "@/config/device";

function Header() {
  const { deviceType } = useDeviceDetection();
  const layout = DEVICE_CONFIG.layout[deviceType];
  
  return (
    <header className={layout.headerHeight}>
      {/* 内容 */}
    </header>
  );
}
```

## 🎨 设计规范

### 移动端设计原则
- **触摸优先**：最小 44px 触摸区域
- **简洁布局**：减少视觉干扰
- **快速访问**：重要功能易于触及
- **清晰层级**：明确的信息结构

### 桌面端设计原则
- **完整功能**：显示所有可用功能
- **高效布局**：利用大屏幕空间
- **键盘友好**：支持键盘导航
- **多任务**：支持多窗口操作

## 🔧 技术实现

### 响应式策略
1. **移动优先**：从移动端开始设计
2. **渐进增强**：逐步添加桌面端功能
3. **断点管理**：统一的断点配置
4. **性能优化**：避免不必要的重渲染

### 性能优化
- 使用 `useMemo` 缓存计算结果
- 避免频繁的 DOM 操作
- 懒加载非关键组件
- 优化动画性能

## 📊 测试建议

### 设备测试
- iPhone SE (375px)
- iPhone 12 (390px)
- iPad (768px)
- iPad Pro (1024px)
- Desktop (1440px+)

### 功能测试
- 窗口大小调整
- 设备旋转
- 触摸交互
- 键盘导航

### 性能测试
- 首次加载时间
- 布局切换性能
- 内存使用情况
- 动画流畅度

## 🔄 扩展指南

### 添加新设备类型
1. 在 `DEVICE_CONFIG` 中添加配置
2. 更新 `useDeviceDetection` hook
3. 创建对应的布局组件
4. 更新 `DeviceRouter` 逻辑

### 自定义断点
```typescript
// 在 device.ts 中修改
breakpoints: {
  mobile: 640,    // 自定义断点
  tablet: 1024,
  desktop: 1280,
}
```

### 添加新功能
1. 在配置中定义功能标志
2. 在布局组件中实现
3. 添加相应的样式和交互
4. 更新文档和测试

---

*此系统提供了灵活的设备适配方案，可根据项目需求进行扩展和定制。* 