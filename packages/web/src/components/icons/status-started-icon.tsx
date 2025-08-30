import { getIconProps } from "./types";

import type { IconProps} from "./types";

export interface StatusStartedIconProps extends IconProps {
  invert?: boolean;
}

export const StatusStartedIcon = ({
  invert = false,
  ...rest
}: StatusStartedIconProps) => {
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
        d="M17.3538 14.8537L12.3538 19.8537C12.2838 19.9237 12.1947 19.9713 12.0977 19.9907C12.0006 20.01 11.9 20.0001 11.8086 19.9622C11.7172 19.9243 11.6391 19.8602 11.5841 19.7779C11.5292 19.6956 11.4999 19.5989 11.5 19.4999V9.49991C11.4999 9.40096 11.5292 9.30421 11.5841 9.22191C11.6391 9.13962 11.7172 9.07547 11.8086 9.03759C11.9 8.99972 12.0006 8.98982 12.0977 9.00914C12.1947 9.02847 12.2838 9.07615 12.3538 9.14616L17.3538 14.1462C17.4002 14.1926 17.4371 14.2477 17.4623 14.3084C17.4874 14.3691 17.5004 14.4342 17.5004 14.4999C17.5004 14.5656 17.4874 14.6307 17.4623 14.6914C17.4371 14.7521 17.4002 14.8072 17.3538 14.8537Z"
        className={fg}
      />
    </svg>
  );
};
