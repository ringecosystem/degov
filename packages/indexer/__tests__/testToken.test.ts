
import {recordsFor_0x0F60F8a} from './testdata/recordsFor_0x0F60F8a'
import {recordsFor_0x6A4Ae46} from './testdata/recordsFor_0x6A4Ae46'
import {recordsFor_0x9Fc3d61} from './testdata/recordsFor_0x9Fc3d61'
import {recordsFor_0x92e9fb9} from './testdata/recordsFor_0x92e9fb9'
import {recordsFor_0x6475741} from './testdata/recordsFor_0x6475741'
import {recordsFor_0xa23d90f} from './testdata/recordsFor_0xa23d90f'
import {recordsFor_0xb258051} from './testdata/recordsFor_0xb258051'
import {recordsFor_0xc183602} from './testdata/recordsFor_0xc183602'
import {recordsFor_0xebd9a48} from './testdata/recordsFor_0xebd9a48'
import {recordsFor_0xf25f97f} from './testdata/recordsFor_0xf25f97f'

interface Delegate {
  id?: string;
  delegator: string;
  fromDelegate: string;
  toDelegate: string;
  power: bigint;
}

interface DelegateChanged {
  delegator: string;
  fromDelegate: string;
  toDelegate: string;
}

interface DelegateMapping {
  id: string;
  from: string;
  to: string;
}

interface Transfer {
  from: string;
  to: string;
  value: bigint;
}

interface PotentialPower {
  address: string;
  power: bigint;
}

const zeroAddress = "0x0000000000000000000000000000000000000000";



test("testTokens", () => {
  const allTestRecords = {
    // "Test Case 0xf25f97f": recordsFor_0xf25f97f,
    // "Test Case 0x92e9fb9": recordsFor_0x92e9fb9,
    // "Test Case 0xa23d90f": recordsFor_0xa23d90f,
    // "Test Case 0xebd9a48": recordsFor_0xebd9a48,
    // "Test Case 0x9Fc3d61": recordsFor_0x9Fc3d61,
    // "Test Case 0xb258051": recordsFor_0xb258051,
    // "Test Case 0x0F60F8a": recordsFor_0x0F60F8a,
    // "Test Case 0x6A4Ae46": recordsFor_0x6A4Ae46,
    "Test Case 0x6475741": recordsFor_0x6475741,
  };

  console.log(" Kicking off all test cases... ");

  for (const [testName, records] of Object.entries(allTestRecords)) {
    // Create a collapsed console group for each test case
    console.groupCollapsed(`🚀 Test Case: ${testName}`);

    // Run the core processing logic
    const results = processRecords(records);

    // Aggregate all results into a single object
    const finalState = {
      delegates: results.delegates,
      mapping: results.mapping,
      // Only display potentialPower if it exists, to keep the output clean
      ...(results.potentials.length > 0 && { potentials: results.potentials }),
    };

    // Print the aggregated result object at once
    console.log("✅ Final Calculated State:", finalState);

    // End the current console group
    console.groupEnd();
  }
});

class DelegateStorage {
  private delegates: Delegate[] = [];
  private delegateMapping: DelegateMapping[] = [];
  private potentialPower: PotentialPower[] = [];

  constructor() {}

  getMapping(): DelegateMapping[] {
    return this.delegateMapping;
  }

  getDelegates(): Delegate[] {
    return this.delegates;
  }

  getPotentialPower(): PotentialPower[] {
    return this.potentialPower;
  }

  /**
   * Processes a single transaction block (containing one or more events).
   * @param transactionRecord - An array of event records representing a single transaction.
   */
  public processTransaction(transactionRecord: any[]) {
    // In a transaction block, the DelegateChanged event provides context for subsequent DelegateVotesChanged events
    const delegateChangedEvent = transactionRecord.find(
      (e) => e.method.toLowerCase() === "delegatechanged"
    ) as DelegateChanged | undefined;

    for (const entry of transactionRecord) {
      const method = entry.method.toLowerCase();
      switch (method) {
        case "transfer":
          this.pushTransfer({
            from: entry.from.toLowerCase(),
            to: entry.to.toLowerCase(),
            value: BigInt(entry.value),
          });
          break;

        case "delegatechanged":
          const cdg = {
            delegator: entry.delegator.toLowerCase(),
            fromDelegate: entry.fromDelegate.toLowerCase(),
            toDelegate: entry.toDelegate.toLowerCase(),
          };
          this.pushMapping(cdg);
          // Handle the special case where a user delegates voting power to themselves
          if (
            (cdg.fromDelegate === zeroAddress ||
              cdg.fromDelegate === cdg.delegator) &&
            cdg.delegator === cdg.toDelegate
          ) {
            const cdelegate: Delegate = {
              delegator: cdg.toDelegate,
              fromDelegate: cdg.delegator,
              toDelegate: cdg.toDelegate,
              power: 0n,
            };
            this.pushDelegator(cdelegate);
          }
          break;

        case "delegatevoteschanged":
          // If there's no associated DelegateChanged event, it usually means this vote change was caused by a transfer.
          // Our pushTransfer method already handles this case, so we can skip it here.
          if (!delegateChangedEvent) {
            console.log("Skipping DelegateVotesChanged from a transfer event.");
            break;
          }
          this.processDelegateVotesChanged(entry, delegateChangedEvent);
          break;

        default:
          // Ignore unknown event types
          break;
      }
    }
  }

  private processDelegateVotesChanged(
    voteChangeEntry: any,
    cdg: DelegateChanged
  ) {
    let fromDelegate: string | undefined;
    let toDelegate: string | undefined;

    const delegateAddress = voteChangeEntry.delegate.toLowerCase();
    const isDelegateChangeToAnother =
      cdg.delegator !== cdg.fromDelegate && cdg.delegator !== cdg.toDelegate;

    if (delegateAddress === cdg.fromDelegate) {
      if (
        (cdg.delegator === cdg.toDelegate &&
          cdg.fromDelegate !== zeroAddress &&
          cdg.fromDelegate !== cdg.delegator) ||
        isDelegateChangeToAnother
      ) {
        fromDelegate = cdg.delegator;
        toDelegate = cdg.fromDelegate;
      } else {
        fromDelegate = cdg.fromDelegate;
        toDelegate = cdg.delegator;
      }
    }

    if (delegateAddress === cdg.toDelegate) {
      fromDelegate = cdg.delegator;
      toDelegate = cdg.toDelegate; // Simplified logic, as toDelegate is always the target
    }

    if (fromDelegate && toDelegate) {
      const cdelegate: Delegate = {
        delegator: cdg.delegator,
        fromDelegate: fromDelegate,
        toDelegate: toDelegate,
        power:
          BigInt(voteChangeEntry.newVotes) -
          BigInt(voteChangeEntry.previousVotes),
      };
      this.pushDelegator(cdelegate);
    }
  }

  private pushMapping(delegateChange: DelegateChanged) {
    const delegator = delegateChange.delegator;
    const clearifyMapping = this.delegateMapping.filter(
      (item) => item.from !== delegator
    );
    clearifyMapping.push({
      id: delegator,
      from: delegator,
      to: delegateChange.toDelegate,
    });
    this.delegateMapping = clearifyMapping;
  }

  private pushDelegator(delegator: Delegate) {
    delegator.id = `${delegator.fromDelegate}_${delegator.toDelegate}`;

    const storedDelegate = this.delegates.find(
      (item) => item.id === delegator.id
    );
    if (!storedDelegate) {
      const storedPotential = this.potentialPower.find(
        (item) => item.address === delegator.toDelegate
      );
      if (storedPotential) {
        delegator.power += storedPotential.power;
        this.potentialPower = this.potentialPower.filter(
          (item) => item.address !== storedPotential.address
        );
      }
      this.delegates.push(delegator);
      return;
    }

    storedDelegate.power += delegator.power;
    if (storedDelegate.power === 0n) {
      this.delegates = this.delegates.filter(
        (item) => item.id !== storedDelegate.id
      );
    }
  }

  private pushTransfer(transfer: Transfer) {
    const { from, to, value } = transfer;

    // Handle the sender ('from' side)
    const fromDelegateMapping = this.delegateMapping.find(
      (item) => item.from === from
    );
    if (fromDelegateMapping) {
      const transferFromDelegate: Delegate = {
        delegator: from,
        fromDelegate: fromDelegateMapping.from,
        toDelegate: fromDelegateMapping.to,
        power: -value,
      };
      this.pushDelegator(transferFromDelegate);
    } else if (from !== zeroAddress) {
      this.updatePotentialPower(from, -value);
    }

    // Handle the receiver ('to' side)
    const toDelegateMapping = this.delegateMapping.find(
      (item) => item.from === to
    );
    if (toDelegateMapping) {
      const transferToDelegate: Delegate = {
        delegator: to,
        fromDelegate: toDelegateMapping.from,
        toDelegate: toDelegateMapping.to,
        power: value,
      };
      this.pushDelegator(transferToDelegate);
    } else if (to !== zeroAddress) {
      this.updatePotentialPower(to, value);
    }
  }

  private updatePotentialPower(address: string, powerChange: bigint) {
    const storedPotential = this.potentialPower.find(
      (item) => item.address === address
    );
    if (storedPotential) {
      storedPotential.power += powerChange;
      if (storedPotential.power === 0n) {
        this.potentialPower = this.potentialPower.filter(
          (item) => item.address !== address
        );
      }
    } else {
      this.potentialPower.push({ address, power: powerChange });
    }
  }
}

// =================================================================
// 2. Abstracted Core Processing Function
// =================================================================

/**
 * Processes an array of transaction records and calculates the final delegation state.
 * @param records - An array containing multiple transaction blocks.
 * @returns {object} - An object containing the final delegates, mapping, and potentialPower.
 */
function processRecords(records: any[][]) {
  const ds = new DelegateStorage();
  for (const transaction of records) {
    ds.processTransaction(transaction);
  }

  return {
    delegates: ds.getDelegates(),
    mapping: ds.getMapping(),
    potentials: ds.getPotentialPower(),
  };
}
