import { ConnectButton } from "@/components/connect-button";

export const Header = () => {
  return (
    <header className="sticky top-0 z-10 w-full border-b border-[#474747] px-[30px] py-[20px] backdrop-blur-sm bg-background/80 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="invisible"></div>
        <ConnectButton />
      </div>
    </header>
  );
};
