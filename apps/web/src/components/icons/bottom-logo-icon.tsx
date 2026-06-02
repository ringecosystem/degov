import { getIconProps } from "./types";

import type { IconProps} from "./types";

export const BottomLogoIcon = (props: IconProps) => {
  const svgProps = getIconProps(props);

  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...svgProps}
    >
      <g clipPath="url(#clip0_12134_2612)">
        <circle cx="8" cy="8" r="8" className="fill-foreground" />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M6.76667 7.075L6.45833 12.625H3.375V9.54167L6.76667 7.075ZM6.76667 7.075L12.625 9.54167V12.625H9.54167L6.76667 7.075ZM6.45833 3.375L6.76667 7.075L3.375 6.45833V3.375H6.45833ZM12.625 3.375V6.45833L6.76667 7.075L9.54167 3.375H12.625Z"
          className="fill-background"
        />
      </g>
      <defs>
        <clipPath id="clip0_12134_2612">
          <rect width="16" height="16" rx="8" className="fill-foreground" />
        </clipPath>
      </defs>
    </svg>
  );
};
