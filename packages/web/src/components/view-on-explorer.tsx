import { cn } from "@/lib/utils";

import { ExternalLinkIcon } from "./icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

interface ViewOnExplorerProps {
  explorerUrl: string;
  className?: string;
  imgClassName?: string;
}
export const ViewOnExplorer = ({
  explorerUrl,
  className,
  imgClassName,
}: ViewOnExplorerProps) => {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "inline-block h-[16px] w-[16px] cursor-pointer transition-opacity hover:opacity-80",
            className
          )}
        >
          <ExternalLinkIcon
            width={16}
            height={16}
            className={cn("h-full w-full text-foreground", imgClassName)}
          />
        </a>
      </TooltipTrigger>
      <TooltipContent>View on explorer</TooltipContent>
    </Tooltip>
  );
};
