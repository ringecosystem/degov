import { Contributor, VoteCastGroup } from "../src/model";
import { GovernorHandler } from "../src/handler/governor";
import { DataHandlerContext, Log as EvmLog } from "@subsquid/evm-processor";
import { Store } from "@subsquid/typeorm-store";
import { ChainTool } from "../src/internal/chaintool";
import { TextPlus } from "../src/internal/textplus";
import { EvmFieldSelection } from "../src/types";

/**
 * Test suite for Contributor last vote tracking functionality
 * 
 * This test suite verifies that:
 * 1. lastVoteBlockNumber and lastVoteTimestamp are correctly updated when a contributor votes
 * 2. The fields remain unchanged when a non-contributor votes
 * 3. The fields are updated correctly on subsequent votes by the same contributor
 */
describe("Governor Vote Tracking Tests", () => {
  // Mock store implementation
  let mockStore: jest.Mocked<Store>;
  let mockCtx: jest.Mocked<DataHandlerContext<Store, EvmFieldSelection>>;
  
  // Sample addresses for testing
  const CONTRIBUTOR_ADDRESS = "0x1234567890123456789012345678901234567890";
  const NON_CONTRIBUTOR_ADDRESS = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
  const PROPOSAL_ID = "1";
  
  beforeEach(() => {
    // Create a fresh mock store for each test
    mockStore = {
      findOne: jest.fn(),
      save: jest.fn(),
      insert: jest.fn(),
    } as any;
    
    mockCtx = {
      store: mockStore,
      log: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
    } as any;
  });

  /**
   * Test 1: Verify that lastVoteBlockNumber and lastVoteTimestamp are correctly 
   * updated when a contributor votes
   */
  it("should update lastVoteBlockNumber and lastVoteTimestamp when a contributor votes", async () => {
    // Arrange: Create a contributor with initial values
    const initialBlockNumber = 1000n;
    const initialTimestamp = 1609459200000n; // Jan 1, 2021
    
    const contributor = new Contributor({
      id: CONTRIBUTOR_ADDRESS,
      blockNumber: initialBlockNumber,
      blockTimestamp: initialTimestamp,
      transactionHash: "0x123",
      power: 100n,
      delegatesCountAll: 1,
      delegatesCountEffective: 1,
      lastVoteBlockNumber: null,
      lastVoteTimestamp: null,
    });
    
    // Mock findOne to return the contributor
    mockStore.findOne.mockResolvedValue(contributor);
    
    // Create a vote cast group representing a vote
    const voteBlockNumber = 2000n;
    const voteTimestamp = 1609545600000n; // Jan 2, 2021
    
    const vcg = new VoteCastGroup({
      id: "vote-1",
      type: "vote-cast-without-params",
      voter: CONTRIBUTOR_ADDRESS,
      refProposalId: PROPOSAL_ID,
      support: 1,
      weight: 100n,
      reason: "I support this proposal",
      blockNumber: voteBlockNumber,
      blockTimestamp: voteTimestamp,
      transactionHash: "0xvote1",
    });
    
    // Act: Create a mock handler and call the storeVoteCastGroup method
    // We'll do this by creating a test-accessible version
    const handler = new (class extends GovernorHandler {
      async testStoreVoteCastGroup(vcg: VoteCastGroup) {
        // Call the private method using TypeScript's bracket notation
        return (this as any).storeVoteCastGroup(vcg);
      }
    })(mockCtx as any, {
      chainId: 1,
      rpcs: ["http://localhost:8545"],
      work: {} as any,
      indexContract: {} as any,
      chainTool: new ChainTool(),
      textPlus: new TextPlus(),
    });
    
    await handler.testStoreVoteCastGroup(vcg);
    
    // Assert: Verify that the contributor was looked up and updated
    expect(mockStore.findOne).toHaveBeenCalledWith(Contributor, {
      where: { id: CONTRIBUTOR_ADDRESS },
    });
    
    expect(mockStore.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: CONTRIBUTOR_ADDRESS,
        lastVoteBlockNumber: voteBlockNumber,
        lastVoteTimestamp: voteTimestamp,
      })
    );
  });

  /**
   * Test 2: Verify that the fields remain unchanged when a non-contributor votes
   */
  it("should not update any fields when a non-contributor votes", async () => {
    // Arrange: Mock findOne to return undefined (no contributor found)
    mockStore.findOne.mockResolvedValue(undefined);
    
    // Create a vote cast group for a non-contributor
    const voteBlockNumber = 2000n;
    const voteTimestamp = 1609545600000n;
    
    const vcg = new VoteCastGroup({
      id: "vote-2",
      type: "vote-cast-without-params",
      voter: NON_CONTRIBUTOR_ADDRESS,
      refProposalId: PROPOSAL_ID,
      support: 1,
      weight: 50n,
      reason: "I support this too",
      blockNumber: voteBlockNumber,
      blockTimestamp: voteTimestamp,
      transactionHash: "0xvote2",
    });
    
    // Act: Process the vote
    const handler = new (class extends GovernorHandler {
      async testStoreVoteCastGroup(vcg: VoteCastGroup) {
        return (this as any).storeVoteCastGroup(vcg);
      }
    })(mockCtx as any, {
      chainId: 1,
      rpcs: ["http://localhost:8545"],
      work: {} as any,
      indexContract: {} as any,
      chainTool: new ChainTool(),
      textPlus: new TextPlus(),
    });
    
    await handler.testStoreVoteCastGroup(vcg);
    
    // Assert: Verify that findOne was called but save was NOT called
    // (since no contributor was found)
    expect(mockStore.findOne).toHaveBeenCalledWith(Contributor, {
      where: { id: NON_CONTRIBUTOR_ADDRESS },
    });
    
    // Save should not be called for the Contributor (only for Proposal and insert for VoteCastGroup)
    const contributorSaveCalls = (mockStore.save as jest.Mock).mock.calls.filter(
      call => call[0] instanceof Contributor
    );
    expect(contributorSaveCalls.length).toBe(0);
  });

  /**
   * Test 3: Verify that the fields are updated correctly on subsequent votes 
   * by the same contributor
   */
  it("should update fields correctly on subsequent votes by the same contributor", async () => {
    // Arrange: Create a contributor who has already voted once
    const firstVoteBlockNumber = 1500n;
    const firstVoteTimestamp = 1609459200000n; // Jan 1, 2021
    
    const contributor = new Contributor({
      id: CONTRIBUTOR_ADDRESS,
      blockNumber: 1000n,
      blockTimestamp: 1609372800000n,
      transactionHash: "0x123",
      power: 100n,
      delegatesCountAll: 1,
      delegatesCountEffective: 1,
      lastVoteBlockNumber: firstVoteBlockNumber,
      lastVoteTimestamp: firstVoteTimestamp,
    });
    
    // Mock findOne to return the contributor
    mockStore.findOne.mockResolvedValue(contributor);
    
    // Create a second vote cast group (subsequent vote)
    const secondVoteBlockNumber = 3000n;
    const secondVoteTimestamp = 1609632000000n; // Jan 3, 2021
    
    const vcg = new VoteCastGroup({
      id: "vote-3",
      type: "vote-cast-with-params",
      voter: CONTRIBUTOR_ADDRESS,
      refProposalId: "2",
      support: 2, // Abstain
      weight: 100n,
      reason: "I abstain this time",
      params: "0xparams",
      blockNumber: secondVoteBlockNumber,
      blockTimestamp: secondVoteTimestamp,
      transactionHash: "0xvote3",
    });
    
    // Act: Process the second vote
    const handler = new (class extends GovernorHandler {
      async testStoreVoteCastGroup(vcg: VoteCastGroup) {
        return (this as any).storeVoteCastGroup(vcg);
      }
    })(mockCtx as any, {
      chainId: 1,
      rpcs: ["http://localhost:8545"],
      work: {} as any,
      indexContract: {} as any,
      chainTool: new ChainTool(),
      textPlus: new TextPlus(),
    });
    
    await handler.testStoreVoteCastGroup(vcg);
    
    // Assert: Verify that the contributor was updated with the NEW vote data
    expect(mockStore.findOne).toHaveBeenCalledWith(Contributor, {
      where: { id: CONTRIBUTOR_ADDRESS },
    });
    
    expect(mockStore.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: CONTRIBUTOR_ADDRESS,
        lastVoteBlockNumber: secondVoteBlockNumber, // Should be updated to new value
        lastVoteTimestamp: secondVoteTimestamp, // Should be updated to new value
      })
    );
    
    // Verify that the old values were NOT preserved
    const savedContributor = (mockStore.save as jest.Mock).mock.calls.find(
      call => call[0].id === CONTRIBUTOR_ADDRESS
    )?.[0];
    
    expect(savedContributor?.lastVoteBlockNumber).not.toBe(firstVoteBlockNumber);
    expect(savedContributor?.lastVoteTimestamp).not.toBe(firstVoteTimestamp);
    expect(savedContributor?.lastVoteBlockNumber).toBe(secondVoteBlockNumber);
    expect(savedContributor?.lastVoteTimestamp).toBe(secondVoteTimestamp);
  });

  /**
   * Test 4: Verify that both vote-cast and vote-cast-with-params types update 
   * the contributor fields
   */
  it("should update contributor fields for both VoteCast and VoteCastWithParams events", async () => {
    // Part 1: Test VoteCast (without params)
    const contributorWithoutParams = new Contributor({
      id: CONTRIBUTOR_ADDRESS,
      blockNumber: 1000n,
      blockTimestamp: 1609459200000n,
      transactionHash: "0x123",
      power: 100n,
      delegatesCountAll: 1,
      delegatesCountEffective: 1,
      lastVoteBlockNumber: null,
      lastVoteTimestamp: null,
    });
    
    // Mock the findOne calls: first for Proposal (returns undefined), then for Contributor, then for DataMetric
    mockStore.findOne
      .mockResolvedValueOnce(undefined) // Proposal lookup
      .mockResolvedValueOnce(contributorWithoutParams) // Contributor lookup
      .mockResolvedValueOnce(undefined); // DataMetric lookup (will create new)
    
    const vcgWithoutParams = new VoteCastGroup({
      id: "vote-4",
      type: "vote-cast-without-params",
      voter: CONTRIBUTOR_ADDRESS,
      refProposalId: PROPOSAL_ID,
      support: 0,
      weight: 100n,
      reason: "Against",
      blockNumber: 2000n,
      blockTimestamp: 1609545600000n,
      transactionHash: "0xvote4",
    });
    
    const handler1 = new (class extends GovernorHandler {
      async testStoreVoteCastGroup(vcg: VoteCastGroup) {
        return (this as any).storeVoteCastGroup(vcg);
      }
    })(mockCtx as any, {
      chainId: 1,
      rpcs: ["http://localhost:8545"],
      work: {} as any,
      indexContract: {} as any,
      chainTool: new ChainTool(),
      textPlus: new TextPlus(),
    });
    
    await handler1.testStoreVoteCastGroup(vcgWithoutParams);
    
    // Find all Contributor save calls
    const contributorSaveCalls = (mockStore.save as jest.Mock).mock.calls.filter(
      call => call[0] instanceof Contributor
    );
    
    // There should be exactly one Contributor save call
    expect(contributorSaveCalls.length).toBe(1);
    
    // The contributor should have been updated
    const savedContributor = contributorSaveCalls[0][0];
    expect(savedContributor.id).toBe(CONTRIBUTOR_ADDRESS);
    expect(savedContributor.lastVoteBlockNumber).toBe(2000n);
    expect(savedContributor.lastVoteTimestamp).toBe(1609545600000n);
    
    // Part 2: Reset mocks and test VoteCastWithParams
    mockStore.save.mockClear();
    mockStore.findOne.mockClear();
    
    const contributorWithParams = new Contributor({
      id: CONTRIBUTOR_ADDRESS,
      blockNumber: 1000n,
      blockTimestamp: 1609459200000n,
      transactionHash: "0x123",
      power: 100n,
      delegatesCountAll: 1,
      delegatesCountEffective: 1,
      lastVoteBlockNumber: 2000n,
      lastVoteTimestamp: 1609545600000n,
    });
    
    // Mock the findOne calls for the second test
    mockStore.findOne
      .mockResolvedValueOnce(undefined) // Proposal lookup
      .mockResolvedValueOnce(contributorWithParams) // Contributor lookup
      .mockResolvedValueOnce(undefined); // DataMetric lookup
    
    const vcgWithParams = new VoteCastGroup({
      id: "vote-5",
      type: "vote-cast-with-params",
      voter: CONTRIBUTOR_ADDRESS,
      refProposalId: "3",
      support: 1,
      weight: 100n,
      reason: "For with params",
      params: "0xparams",
      blockNumber: 3000n,
      blockTimestamp: 1609632000000n,
      transactionHash: "0xvote5",
    });
    
    const handler2 = new (class extends GovernorHandler {
      async testStoreVoteCastGroup(vcg: VoteCastGroup) {
        return (this as any).storeVoteCastGroup(vcg);
      }
    })(mockCtx as any, {
      chainId: 1,
      rpcs: ["http://localhost:8545"],
      work: {} as any,
      indexContract: {} as any,
      chainTool: new ChainTool(),
      textPlus: new TextPlus(),
    });
    
    await handler2.testStoreVoteCastGroup(vcgWithParams);
    
    // Find all Contributor save calls from the second part
    const contributorSaveCalls2 = (mockStore.save as jest.Mock).mock.calls.filter(
      call => call[0] instanceof Contributor
    );
    
    // There should be exactly one Contributor save call in this second test
    expect(contributorSaveCalls2.length).toBe(1);
    const secondSave = contributorSaveCalls2[0][0];
    expect(secondSave.id).toBe(CONTRIBUTOR_ADDRESS);
    expect(secondSave.lastVoteBlockNumber).toBe(3000n);
    expect(secondSave.lastVoteTimestamp).toBe(1609632000000n);
  });
});
