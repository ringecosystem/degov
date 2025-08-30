import { getIconProps } from "./types";

import type { IconProps} from "./types";

export interface StatusEndedIconProps extends IconProps {
  invert?: boolean;
}

export const StatusEndedIcon = ({
  invert = false,
  ...rest
}: StatusEndedIconProps) => {
  const svgProps = getIconProps(rest);

  const bg = invert ? "fill-foreground" : "fill-background";
  const fg = invert ? "fill-background" : "fill-foreground";

  return (
    <svg
      viewBox="0 0 28 29"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...svgProps}
    >
      <rect x="1" y="1.5" width="26" height="26" rx="13" className={bg} />
      <rect
        x="1"
        y="1.5"
        width="26"
        height="26"
        rx="13"
        strokeWidth="2"
        className="stroke-foreground stroke-2"
      />
      <path
        d="M19.5 10V19C19.5 19.2652 19.3946 19.5196 19.2071 19.7071C19.0196 19.8946 18.7652 20 18.5 20H9.5C9.23478 20 8.98043 19.8946 8.79289 19.7071C8.60536 19.5196 8.5 19.2652 8.5 19V10C8.5 9.73478 8.60536 9.48043 8.79289 9.29289C8.98043 9.10536 9.23478 9 9.5 9H18.5C18.7652 9 19.0196 9.10536 19.2071 9.29289C19.3946 9.48043 19.5 9.73478 19.5 10Z"
        className={fg}
      />
    </svg>
  );
};
