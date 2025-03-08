import Image from "next/image";

import { useConfig } from "@/hooks/useConfig";

type TransactionStatusType = "pending" | "success" | "failed";

interface TransactionStatusProps {
  status: TransactionStatusType;
  transactionHash: `0x${string}`;
}

const getStatusMessage = (status: TransactionStatusType) => {
  switch (status) {
    case "pending":
      return "Transaction Pending";
    case "success":
      return "Transaction Confirmed";
    case "failed":
      return "Transaction Failed";
    default:
      return "Unknown Status";
  }
};

export function TransactionStatus({
  status,
  transactionHash,
}: TransactionStatusProps) {
  const daoConfig = useConfig();
  const explorerUrl = daoConfig?.network?.explorer?.[0];
  const name = daoConfig?.network?.name;

  return (
    <div className="py-[4px]">
      <p>
        {getStatusMessage(status)}
        {name && ` on ${name}`}
      </p>
      <div>
        <a
          href={`${explorerUrl}/tx/${transactionHash}`}
          className="flex items-center gap-[10px] text-[12px] font-normal tabular-nums leading-normal text-foreground hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          Tx:{transactionHash.slice(0, 6)}...{transactionHash.slice(-4)}
          <Image src="/assets/image/link.svg" alt="link" width={8} height={8} />
        </a>
      </div>
    </div>
  );
}
