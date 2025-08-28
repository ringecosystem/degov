import { ethers } from "ethers";
import { useState, useEffect } from "react";

import { useDaoConfig } from "@/hooks/useDaoConfig";
import { simplifyFunctionSignature } from "@/utils";
import { decodeRecursive, type DecodeRecursiveResult } from "@/utils/decoder";

export interface Action {
  target: string;
  calldata: string;
  signature?: string;
  value: string;
}

export interface DecodedAction extends Action {
  decodedResult?: DecodeRecursiveResult | null;
  isDecoding?: boolean;
  parsedCalldata?: ParsedParam[];
  functionName?: string;
  fullFunctionSignature?: string;
}

export interface ParsedParam {
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

const decodingCache = new Map<string, Promise<DecodeRecursiveResult | null>>();

export function useDecodeCallData(actions: Action[]): DecodedAction[] {
  const daoConfig = useDaoConfig();
  const [decodedActions, setDecodedActions] = useState<DecodedAction[]>([]);

  // Decode actions using calldata decoder
  useEffect(() => {
    const decodeActions = async () => {
      const decoded = await Promise.all(
        actions.map(async (action) => {
          // Skip decoding for simple transfers or empty calldata
          if (!action.calldata || action.calldata === "0x") {
            return { ...action, decodedResult: null, isDecoding: false };
          }

          // Create cache key including all parameters that affect decoding
          const cacheKey = `${action.calldata}-${action.target}-${daoConfig?.chain?.id}-${action.signature}`;
          // Check if decoding is already in progress
          let decodePromise = decodingCache.get(cacheKey);
          if (!decodePromise) {
            // Create new decoding promise and cache it
            decodePromise = (async () => {
              try {
                // First, try simple signature-based parsing (faster)
                if (action.signature) {
                  const simpleParams = parseCalldataParams(
                    action.signature,
                    action.calldata
                  );
                  if (simpleParams.length > 0) {
                    // If simple parsing succeeded, return a compatible result
                    return {
                      functionName: action.signature.split("(")[0],
                      args: simpleParams.map((param) => ({
                        name: param.name,
                        type: param.type,
                        value: param.value,
                      })),
                      rawArgs: simpleParams.map((param) => param.value),
                    };
                  }
                }

                let result = null;

                // If simple parsing failed, try advanced decoding with contract address
                if (daoConfig?.chain?.id && action.target) {
                  result = await decodeRecursive({
                    calldata: action.calldata,
                    address: action.target,
                    chainId: daoConfig.chain.id,
                  });
                }

                return result;
              } catch {
                return null;
              }
            })();

            decodingCache.set(cacheKey, decodePromise);
          }

          const result = await decodePromise;
          return { ...action, decodedResult: result, isDecoding: false };
        })
      );
      // Process decoded results to add parsed calldata and function info
      const processedDecoded = decoded.map((action) => {
        // Extract parsed calldata from decoded result
        let parsedCalldata: ParsedParam[] = [];
        if (action.decodedResult?.args) {
          parsedCalldata = action.decodedResult.args.map((param) => ({
            name: param.name,
            type: param.type,
            value: Array.isArray(param.value)
              ? param.value
              : String(param.value),
          }));
        }

        // Extract function name
        const functionName =
          action.decodedResult?.functionName || action.signature?.split("(")[0];

        // Construct full function signature with parameter names
        let fullFunctionSignature = "";
        if (action.decodedResult?.functionName && parsedCalldata.length > 0) {
          const params = parsedCalldata
            .map((param) => `${param.type} ${param.name}`)
            .join(", ");
          fullFunctionSignature = `${action.decodedResult.functionName}(${params})`;
        } else if (action.signature) {
          fullFunctionSignature = action.signature;
        } else if (action.decodedResult?.functionName) {
          fullFunctionSignature = `${action.decodedResult.functionName}()`;
        }

        return {
          ...action,
          parsedCalldata,
          functionName,
          fullFunctionSignature,
        };
      });

      setDecodedActions(processedDecoded);
    };

    if (actions.length > 0) {
      // Set initial loading state
      setDecodedActions(
        actions.map((action) => ({ ...action, isDecoding: true }))
      );
      decodeActions();
    }
  }, [actions, daoConfig?.chain?.id]);

  return decodedActions;
}
