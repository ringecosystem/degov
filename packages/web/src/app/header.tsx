import { ConnectButton } from "@/components/connect-button";

export const Header = () => {
  return (
    <header className="w-full border-b border-[#474747] bg-background px-[30px] py-[20px]">
      <div className="flex items-center justify-between">
        <div className="invisible"></div>
        <ConnectButton />
      </div>
    </header>
  );
};
