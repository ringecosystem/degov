import { getIconProps } from "./types";

import type { IconProps} from "./types";

export interface StatusExecutedIconProps extends IconProps {
  invert?: boolean;
}

export const StatusExecutedIcon = ({
  invert = false,
  ...rest
}: StatusExecutedIconProps) => {
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
        d="M19 8.5H9C8.73478 8.5 8.48043 8.60536 8.29289 8.79289C8.10536 8.98043 8 9.23478 8 9.5V19.5C8 19.7652 8.10536 20.0196 8.29289 20.2071C8.48043 20.3946 8.73478 20.5 9 20.5H15.7931C15.9245 20.5004 16.0546 20.4747 16.176 20.4244C16.2973 20.3741 16.4075 20.3001 16.5 20.2069L19.7069 17C19.8001 16.9075 19.8741 16.7973 19.9244 16.676C19.9747 16.5546 20.0004 16.4245 20 16.2931V9.5C20 9.23478 19.8946 8.98043 19.7071 8.79289C19.5196 8.60536 19.2652 8.5 19 8.5ZM16 19.2931V16.5H18.7931L16 19.2931Z"
        className={fg}
      />
    </svg>
  );
};
