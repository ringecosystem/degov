import { ethers } from "ethers";
import { parseUnits } from "ethers";
import { useMemo } from "react";

import { useConfig } from "@/hooks/useConfig";

export interface Action {
  target: string;
  calldata: string;
  signature?: string;
  value: string;
}

interface ActionTableRawProps {
  actions: Action[];
}

export function ActionTableRaw({ actions }: ActionTableRawProps) {
  const daoConfig = useConfig();

  const processedActions = useMemo(() => {
    return actions.map((action) => {
      let inferredType = "transfer";
      if (action.calldata === "0x" || !action.calldata) {
        inferredType = "transfer";
      } else {
        inferredType = "custom";
      }

      let parsedCalldata: { name: string; value: string | string[] }[] = [];
      if (inferredType === "custom" && action.signature) {
        try {
          const iface = new ethers.Interface([`function ${action.signature}`]);
          const decoded = iface.decodeFunctionData(
            action.signature.split("(")[0],
            action.calldata
          );

          const paramTypes =
            action.signature
              .match(/\((.*)\)/)?.[1]
              .split(",")
              .filter(Boolean) || [];

          parsedCalldata = paramTypes.map((type, i) => {
            let value = decoded[i];

            if (typeof value === "bigint") {
              value = value.toString();
            } else if (Array.isArray(value)) {
              value = Array.from(value).map((v) =>
                typeof v === "bigint" ? v.toString() : v
              );
            }

            return {
              name: type,
              value,
            };
          });
        } catch (e) {
          console.warn("Error parsing calldata:", e);
        }
      }

      return {
        ...action,
        inferredType,
        parsedCalldata,
        address: action.target,
      };
    });
  }, [actions]);

  return (
    <div className="space-y-[20px]">
      {processedActions.map((action, index) => (
        <div key={index}>
          <h3 className="mb-[10px] text-[18px] font-semibold">
            Function {index + 1}
          </h3>

          <div className="space-y-[20px] rounded-[4px] border p-[20px]">
            {action.inferredType === "custom" && (
              <div>
                <h4 className="text-[14px] font-normal text-muted-foreground">
                  Signature:
                </h4>
                <p
                  className="font-mono text-[14px]"
                  style={{ wordWrap: "break-word" }}
                >
                  {action.signature}
                </p>
              </div>
            )}

            {action.inferredType === "custom" &&
              action.parsedCalldata.length > 0 && (
                <div>
                  <h4 className="text-[14px] font-normal text-muted-foreground">
                    Calldata:
                  </h4>
                  {action.parsedCalldata.map(({ name, value }, cIndex) => (
                    <div
                      key={cIndex}
                      className="font-mono text-[14px]"
                      style={{ wordWrap: "break-word" }}
                    >
                      {name}:{" "}
                      {Array.isArray(value) ? `[${value.join(", ")}]` : value}
                    </div>
                  ))}
                </div>
              )}

            {action.address && (
              <div>
                <h4 className="text-[14px] font-normal text-muted-foreground">
                  Target:
                </h4>
                <p className="font-mono text-[14px]">{action.address}</p>
              </div>
            )}

            <div>
              <h4 className="text-[14px] font-normal text-muted-foreground">
                Value:
              </h4>
              <p className="font-mono text-[14px]">
                {action.value
                  ? parseUnits(
                      action.value,
                      daoConfig?.network?.nativeToken?.decimals ?? 18
                    )
                  : "0"}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
