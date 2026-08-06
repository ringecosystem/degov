import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";

import {
  buildProposalInfiniteInitialData,
  buildProposalListQueryKey,
  getProposalNextPageParam,
  shouldUseProposalInitialPage,
  type ProposalPageParam,
} from "../src/lib/proposal-directory-query-contract.ts";
import { hasProposalDirectoryLoadError } from "../src/lib/proposal-directory-state.ts";

const readSource = (relativePath: string) =>
  readFileSync(path.join(import.meta.dirname, "..", relativePath), "utf8");

test("proposal directory renders the existing proposal UI from server first-page data", () => {
  const pageSource = readSource("src/app/proposals/page.tsx");
  const clientSource = readSource("src/app/proposals/proposals-client.tsx");
  const tableSource = readSource("src/components/proposals-table/index.tsx");
  const listSource = readSource("src/components/proposals-list/index.tsx");
  const hookSource = readSource(
    "src/components/proposals-table/hooks/useProposalData.ts"
  );
  const localePageSource = readSource("src/app/[locale]/proposals/page.tsx");

  assert.match(
    pageSource,
    /const initialPage = await getPublicProposalList\(config\)/
  );
  assert.match(pageSource, /<ProposalsClient initialPage=\{initialPage\} \/>/);
  assert.doesNotMatch(pageSource, /ProposalDirectoryPublicSummary/);

  assert.match(
    localePageSource,
    /export\s+\{\s*default,\s*generateMetadata\s*\}\s+from\s+"..\/..\/proposals\/page"/
  );

  assert.match(clientSource, /loadingFallback=\{\s*<ProposalsTable/);
  assert.match(clientSource, /<h1 className="text-\[18px\] font-extrabold">/);
  assert.match(clientSource, /desktop=\{\s*<ProposalsTable/);
  assert.match(clientSource, /mobile=\{\s*<ProposalsList/);
  assert.match(clientSource, /initialPage=\{initialPage\}/);

  assert.match(tableSource, /href=\{`\/proposal\/\$\{record\.proposalId\}`\}/);
  assert.match(tableSource, /\{record\.title\}/);
  assert.match(tableSource, /initialPage\?: InitialProposalPage/);
  assert.match(listSource, /href=\{`\/proposal\/\$\{record\.proposalId\}`\}/);
  assert.match(listSource, /\{record\.title\}/);

  assert.match(hookSource, /initialData:\s*shouldUseInitialPage/);
  assert.match(tableSource, /state\.directoryLoadFailed/);
  assert.match(listSource, /state\.directoryLoadFailed/);
});

test("proposal directory initial data distinguishes empty and temporary failure states", () => {
  const publicSeoSource = readSource("src/app/_server/public-seo.ts");
  const querySource = readSource(
    "src/lib/proposal-directory-query-contract.ts"
  );

  assert.match(publicSeoSource, /failed:\s*false/);
  assert.match(publicSeoSource, /failed:\s*true/);
  assert.match(publicSeoSource, /PROPOSAL_DIRECTORY_INITIAL_PAGE_SIZE/);

  assert.match(querySource, /if \(!initialPage\) return undefined/);
  assert.match(querySource, /pages:\s*\[initialPage\.proposals\]/);
  assert.match(querySource, /pageParams:/);
  assert.match(publicSeoSource, /failed:\s*true,[\s\S]*updatedAt:\s*0/);
});

test("proposal directory failure state follows the current query result", () => {
  assert.equal(
    hasProposalDirectoryLoadError({
      isError: false,
      usesInitialPage: true,
      initialPageFailed: true,
      dataUpdatedAt: 0,
    }),
    true,
    "a failed server read remains unavailable while its retry is pending"
  );

  assert.equal(
    hasProposalDirectoryLoadError({
      isError: false,
      usesInitialPage: true,
      initialPageFailed: true,
      dataUpdatedAt: Date.now(),
    }),
    false,
    "a successful empty retry clears the initial server failure"
  );

  assert.equal(
    hasProposalDirectoryLoadError({
      isError: false,
      usesInitialPage: false,
      initialPageFailed: true,
      dataUpdatedAt: Date.now(),
    }),
    false,
    "an empty wallet or support filter does not inherit the server failure"
  );

  assert.equal(
    hasProposalDirectoryLoadError({
      isError: true,
      usesInitialPage: false,
      initialPageFailed: false,
      dataUpdatedAt: 0,
    }),
    true,
    "a failed filtered request reports the current error"
  );
});

test("proposal directory hydrates and paginates through the production query contract", async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const initialProposals = Array.from({ length: 30 }, (_, index) => index);
  const calls: ProposalPageParam[] = [];
  const queryKey = buildProposalListQueryKey({
    config: {
      code: "fixture",
      indexer: { endpoint: "https://indexer.example/graphql" },
      chain: { id: 1 },
      contracts: { governor: "0xABC" },
    },
    pageSize: 10,
    initialPageSize: 30,
  });
  const observer = new InfiniteQueryObserver<number[]>(queryClient, {
    queryKey,
    queryFn: async ({ pageParam }) => {
      calls.push(pageParam as ProposalPageParam);
      return [30, 31];
    },
    initialPageParam: { offset: 0, limit: 30 },
    initialData: buildProposalInfiniteInitialData({
      proposals: initialProposals,
      pageSize: 30,
    }),
    staleTime: Infinity,
    getNextPageParam: (lastPage, _pages, lastPageParam) =>
      getProposalNextPageParam(
        lastPage,
        lastPageParam as ProposalPageParam,
        30,
        10
      ),
  });
  const unsubscribe = observer.subscribe(() => {});

  assert.equal(calls.length, 0, "fresh server data must not refetch on hydration");
  await observer.fetchNextPage();
  assert.deepEqual(calls, [{ offset: 30, limit: 10 }]);
  assert.deepEqual(observer.getCurrentResult().data?.pages.flat(), [
    ...initialProposals,
    30,
    31,
  ]);

  unsubscribe();
  queryClient.clear();
});

test("proposal directory only reuses anonymous initial data for the matching query", () => {
  const base = {
    initialPageSize: 30,
    normalizedInitialPageSize: 30,
  };

  assert.equal(shouldUseProposalInitialPage(base), true);
  assert.equal(
    shouldUseProposalInitialPage({ ...base, address: "0x123" }),
    false
  );
  assert.equal(
    shouldUseProposalInitialPage({ ...base, address: "0x123", support: "1" }),
    false
  );
  assert.equal(
    shouldUseProposalInitialPage({ ...base, connectedAddress: "0x456" }),
    false
  );

  const anonymousKey = buildProposalListQueryKey({
    pageSize: 10,
    initialPageSize: 30,
  });
  const walletKey = buildProposalListQueryKey({
    address: "0x123",
    pageSize: 10,
    initialPageSize: 30,
  });
  const supportKey = buildProposalListQueryKey({
    address: "0x123",
    support: "1",
    pageSize: 10,
    initialPageSize: 30,
  });
  const connectedWalletKey = buildProposalListQueryKey({
    connectedAddress: "0x456",
    pageSize: 10,
    initialPageSize: 30,
  });
  assert.notDeepEqual(walletKey, anonymousKey);
  assert.notDeepEqual(supportKey, walletKey);
  assert.notDeepEqual(connectedWalletKey, anonymousKey);
});
