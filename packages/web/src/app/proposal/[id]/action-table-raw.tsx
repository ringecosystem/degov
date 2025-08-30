import { ethers } from "ethers";
import { parseUnits } from "ethers";
import { useMemo } from "react";

import { useDaoConfig } from "@/hooks/useDaoConfig";
import { simplifyFunctionSignature } from "@/utils";

export interface Action {
  target: string;
  calldata: string;
  signature?: string;
  value: string;
}

interface ActionTableRawProps {
  actions: Action[];
}

interface ParsedParam {
  name: string;
  type: string;
  value: string | string[];
}

function parseCalldataParams(
  signature: string,
  calldata: string
): ParsedParam[] {
  if (!signature || !calldata || calldata === "0x") return [];

  try {
    const simplifiedSignature = simplifyFunctionSignature(signature);
    const iface = new ethers.Interface([`function ${simplifiedSignature}`]);
    const decoded = iface.decodeFunctionData(
      simplifiedSignature.split("(")[0],
      calldata
    );

    const match = signature.match(/\((.*)\)/);
    if (!match || !match[1].trim()) return [];

    const paramsString = match[1];
    const paramDefinitions = paramsString
      .split(",")
      .map((param) => param.trim());

    return paramDefinitions.map((paramDef, index) => {
      const parts = paramDef.trim().split(/\s+/);
      const type = parts[0];
      const name = parts.length >= 2 ? parts.slice(1).join(" ") : type;

      let value = decoded[index];
      if (typeof value === "bigint") {
        value = value.toString();
      } else if (Array.isArray(value)) {
        value = Array.from(value).map((v) =>
          typeof v === "bigint" ? v.toString() : v
        );
      }

      return {
        name,
        type,
        value: Array.isArray(value) ? value : String(value),
      };
    });
  } catch (e) {
    console.warn("Error parsing calldata:", e);
    return [];
  }
}

export function ActionTableRaw({ actions }: ActionTableRawProps) {
  const daoConfig = useDaoConfig();

  const processedActions = useMemo(() => {
    return actions.map((action) => {
      let inferredType = "transfer";
      const isXAccount =
        action?.signature ===
        "send(uint256 toChainId, address toDapp, bytes calldata message, bytes calldata params) external payable";

      if (action.calldata === "0x" || !action.calldata) {
        inferredType = "transfer";
      } else {
        inferredType = isXAccount ? "xaccount" : "custom";
      }

      let parsedCalldata: ParsedParam[] = [];
      if (
        (inferredType === "custom" || inferredType === "xaccount") &&
        action.signature
      ) {
        parsedCalldata = parseCalldataParams(action.signature, action.calldata);
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

          <div className="space-y-[10px] rounded-[4px] border border-gray-1 p-[10px] bg-background">
            {(action.inferredType === "custom" ||
              action.inferredType === "xaccount") && (
              <div>
                <h4 className="text-[14px] font-normal text-muted-foreground">
                  Signature:
                </h4>
                <p
                  className="font-mono text-[14px]"
                  style={{ wordWrap: "break-word" }}
                >
                  {action.signature ?? ""}
                </p>
              </div>
            )}

            {(action.inferredType === "custom" ||
              action.inferredType === "xaccount") &&
              action.parsedCalldata.length > 0 && (
                <div>
                  <h4 className="text-[14px] font-normal text-muted-foreground">
                    Calldata:
                  </h4>
                  {action.parsedCalldata.map((param, cIndex) => (
                    <div
                      key={cIndex}
                      className="font-mono text-[14px]"
                      style={{ wordWrap: "break-word" }}
                    >
                      {param.name}:{" "}
                      {Array.isArray(param.value)
                        ? `[${param.value.join(", ")}]`
                        : param.value}
                    </div>
                  ))}
                </div>
              )}

            {action.address && (
              <div>
                <h4 className="text-[14px] font-normal text-muted-foreground">
                  Target:
                </h4>
                <p className="font-mono text-[14px] break-all">
                  {action.address}
                </p>
              </div>
            )}

            <div>
              <h4 className="text-[14px] font-normal text-muted-foreground">
                Value:
              </h4>
              <p className="font-mono text-[14px] break-all">
                {action.value
                  ? parseUnits(
                      action.value,
                      daoConfig?.chain?.nativeToken?.decimals ?? 18
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
