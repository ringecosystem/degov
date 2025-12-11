import { useQuery } from '@tanstack/react-query';

// need indexer block number
export const useIndexerBlockNumber = () => {
  return useQuery({
    queryKey: ['indexer-block-number'],
    queryFn: () => fetchIndexerBlockNumber()
  });
};

// faker indexer block number
const fetchIndexerBlockNumber = async () => {
  return Math.floor(Math.random() * 1000000) + 1;
};
