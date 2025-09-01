import { useMemo } from "react";

import { useDecodeCallData, type Action } from "@/hooks/useDecodeCallData";

interface ActionTableRawProps {
  actions: Action[];
}


export function ActionTableRaw({ actions }: ActionTableRawProps) {
  const decodedActions = useDecodeCallData(actions);

  const processedActions = useMemo(() => {
    return decodedActions.map((action) => {
      let inferredType = "transfer";
      const isXAccount =
        action?.signature ===
        "send(uint256 toChainId, address toDapp, bytes calldata message, bytes calldata params) external payable";

      if (action.calldata === "0x" || !action.calldata) {
        inferredType = "transfer";
      } else {
        inferredType = isXAccount ? "xaccount" : "custom";
      }

      // Use parameters from hook
      const parsedCalldata = action.parsedCalldata || [];

      return {
        ...action,
        inferredType,
        parsedCalldata,
        address: action.target,
        functionName: action.functionName,
        fullFunctionSignature: action.fullFunctionSignature,
      };
    });
  }, [decodedActions]);

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
                  {action.fullFunctionSignature || action.signature || action.functionName || ""}
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

            {action.isDecoding && (
              <div>
                <h4 className="text-[14px] font-normal text-muted-foreground">
                  Status:
                </h4>
                <p className="text-[14px] text-muted-foreground">
                  🔄 Decoding parameters...
                </p>
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
                {action.value || "0"}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
