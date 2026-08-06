export function hasProposalDirectoryLoadError({
  isError,
  usesInitialPage,
  initialPageFailed,
  dataUpdatedAt,
}: {
  isError: boolean;
  usesInitialPage: boolean;
  initialPageFailed: boolean;
  dataUpdatedAt: number;
}) {
  return (
    isError ||
    (usesInitialPage && initialPageFailed && dataUpdatedAt === 0)
  );
}
