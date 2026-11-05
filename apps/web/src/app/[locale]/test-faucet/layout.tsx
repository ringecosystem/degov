import { buildNoPublicPreviewMetadata } from "@/lib/metadata";

export const metadata = buildNoPublicPreviewMetadata("KTON Testnet Faucet");

export default function TestFaucetLayout({ children }: { children: React.ReactNode }) {
  return children;
}
