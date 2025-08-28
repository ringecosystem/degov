import { SVGProps } from 'react';

export interface IconProps extends SVGProps<SVGSVGElement> {}

export const getIconProps = ({ width = 24, height = 24, ...props }: IconProps) => {
  return {
    width,
    height,
    ...props,
  };
};