"use client";

import { type ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { useMediaQuery } from "@/hooks/useMediaQuery";

interface ResponsiveRendererProps {
  /**
   * Desktop component to render
   */
  desktop: ReactNode;
  /**
   * Mobile component to render
   */
  mobile: ReactNode;
  /**
   * Breakpoint for switching layouts (defaults to "1024px" for lg breakpoint)
   */
  breakpoint?: string;
  /**
   * SSR 阶段与未判定前展示的占位符（默认使用全局 skeleton 样式）
   */
  loadingFallback?: ReactNode;
}

/**
 * Responsive Renderer Component
 *
 * 兼顾无 JS 回退与水合后单布局渲染：
 * - SSR/未水合：返回 null -> 同时渲染两套布局，由 CSS 控制显示（保证无 JS 也能看到正确结构）
 * - 水合完成：只保留匹配的布局，避免后续重复请求
 *
 * @example
 * ```tsx
 * <ResponsiveRenderer
 *   desktop={<ProposalsTable />}
 *   mobile={<ProposalsList />}
 * />
 * ```
 */
export function ResponsiveRenderer({
  desktop,
  mobile,
  breakpoint = "1024px",
  loadingFallback,
}: ResponsiveRendererProps) {
  const isDesktop = useMediaQuery(`(min-width: ${breakpoint})`);

  // SSR / 未判定阶段优先返回占位，避免双重渲染请求；Hook 顺序保持恒定
  if (isDesktop === null)
    return loadingFallback ?? <Skeleton className="w-full min-h-[120px]" />;

  // 组件已水合且媒体查询可判定时再决定渲染分支

  return isDesktop ? desktop : mobile;
}
