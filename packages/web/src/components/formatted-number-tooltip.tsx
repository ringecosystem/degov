import React from 'react';

import { DECIMAL } from '@/config/base';
import { cn } from '@/lib/utils';
import { formatBigIntWithDecimals } from '@/utils/number';

import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

import type { ReactNode } from 'react';

interface FormattedNumberTooltipProps {
  value: bigint;
  valueDecimals: number;
  decimals?: number;
  className?: string;
  children?: (formattedValue: string) => ReactNode;
}

const FormattedNumberTooltip = React.forwardRef<HTMLDivElement, FormattedNumberTooltipProps>(
  ({ value, valueDecimals, decimals = DECIMAL, className, children }, ref) => {
    const [formattedValue, formattedValueWithDecimals] = formatBigIntWithDecimals(
      value,
      valueDecimals,
      decimals
    );
    const renderContent = children || ((formattedValue: string) => formattedValue);

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div ref={ref} className={cn('cursor-pointer', className)}>
            {renderContent(formattedValueWithDecimals)}
          </div>
        </TooltipTrigger>
        <TooltipContent>{formattedValue}</TooltipContent>
      </Tooltip>
    );
  }
);

FormattedNumberTooltip.displayName = 'FormattedNumberTooltip';

export default FormattedNumberTooltip;
