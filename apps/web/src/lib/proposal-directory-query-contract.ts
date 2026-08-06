export type ProposalPageParam = {
  offset: number;
  limit: number;
};

type ProposalQueryConfig = {
  code?: string;
  indexer?: { endpoint?: string };
  chain?: { id?: number };
  contracts?: { governor?: string };
};

export function normalizeProposalInitialPageSize(
  pageSize: number,
  initialPageSize: number
) {
  return Math.max(pageSize, initialPageSize);
}

export function shouldUseProposalInitialPage({
  address,
  support,
  connectedAddress,
  initialPageSize,
  normalizedInitialPageSize,
}: {
  address?: string;
  support?: string;
  connectedAddress?: string;
  initialPageSize?: number;
  normalizedInitialPageSize: number;
}) {
  return (
    !address &&
    !support &&
    !connectedAddress &&
    initialPageSize === normalizedInitialPageSize
  );
}

export function buildProposalListQueryKey({
  config,
  address,
  support,
  pageSize,
  initialPageSize,
  connectedAddress,
}: {
  config?: ProposalQueryConfig | null;
  address?: string;
  support?: string;
  pageSize: number;
  initialPageSize: number;
  connectedAddress?: string;
}) {
  return [
    "proposals",
    config?.code,
    config?.indexer?.endpoint,
    config?.chain?.id,
    config?.contracts?.governor?.toLowerCase(),
    address?.toLowerCase(),
    support,
    pageSize,
    initialPageSize,
    connectedAddress?.toLowerCase(),
  ] as const;
}

export function buildProposalInfiniteInitialData<T>(initialPage?: {
  proposals: T[];
  pageSize: number;
}) {
  if (!initialPage) return undefined;

  return {
    pages: [initialPage.proposals],
    pageParams: [
      {
        offset: 0,
        limit: initialPage.pageSize,
      } satisfies ProposalPageParam,
    ],
  };
}

export function getProposalNextPageParam<T>(
  lastPage: T[] | undefined,
  lastPageParam: ProposalPageParam | undefined,
  initialPageSize: number,
  pageSize: number
) {
  const lastParam = lastPageParam ?? {
    offset: 0,
    limit: initialPageSize,
  };

  if (!lastPage || lastPage.length < lastParam.limit) return undefined;

  return {
    offset: lastParam.offset + lastPage.length,
    limit: pageSize,
  } satisfies ProposalPageParam;
}
