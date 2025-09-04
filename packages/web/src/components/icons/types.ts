import type { SVGProps } from 'react';

export type IconProps = SVGProps<SVGSVGElement>;

export const getIconProps = ({ width = 24, height = 24, ...props }: IconProps) => {
  return {
    width,
    height,
    ...props,
  };
};