import { getIconProps } from "./types";

import type { IconProps} from "./types";

export interface StatusQueuedIconProps extends IconProps {
  invert?: boolean;
}

export const StatusQueuedIcon = ({
  invert = false,
  ...rest
}: StatusQueuedIconProps) => {
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
        d="M21.2073 12.182L13.1823 20.207C12.9948 20.3944 12.7406 20.4997 12.4755 20.4997C12.2104 20.4997 11.9561 20.3944 11.7686 20.207L7.29235 15.707C7.10515 15.5195 7 15.2654 7 15.0004C7 14.7355 7.10515 14.4814 7.29235 14.2939L8.54235 13.0439C8.72976 12.8572 8.98348 12.7525 9.24797 12.7525C9.51247 12.7525 9.76618 12.8572 9.9536 13.0439L12.5005 15.5139L18.548 9.54075C18.7354 9.35393 18.9893 9.24902 19.2539 9.24902C19.5186 9.24902 19.7724 9.35393 19.9598 9.54075L21.2067 10.762C21.3005 10.8549 21.3749 10.9655 21.4258 11.0873C21.4766 11.2092 21.5028 11.3399 21.5028 11.4719C21.5029 11.6039 21.4768 11.7346 21.4261 11.8565C21.3754 11.9784 21.301 12.089 21.2073 12.182Z"
        className={fg}
      />
    </svg>
  );
};
