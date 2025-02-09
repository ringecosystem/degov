import { Outlet } from '@tanstack/react-router';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Aside } from './aside';
import { Header } from './header';
import { useBlockNumber } from 'wagmi';
import { useIndexerBlockNumber } from '@/hooks/useIndexerBlockNumber';
import { useIndexerStatus } from '@/hooks/useIndexerStatus';
import { useEffect } from 'react';

const Root = () => {
  // get current block number
  const { data: blockNumber } = useBlockNumber();
  // get indexer block number
  const { data: indexerBlockNumber } = useIndexerBlockNumber();

  // get indexer status
  const { updateStatus } = useIndexerStatus();

  useEffect(() => {
    if (blockNumber && indexerBlockNumber) {
      updateStatus(Number(blockNumber), Number(indexerBlockNumber));
    }
  }, [blockNumber, indexerBlockNumber, updateStatus]);

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-screen w-screen bg-background font-sans antialiased">
        <aside className="w-[240px] border-r border-border bg-background">
          <Aside />
        </aside>
        <main className="flex flex-1 flex-col">
          <Header />
          <div className="mx-auto h-full w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
};

export default Root;
