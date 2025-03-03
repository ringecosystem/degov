import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BigIntColumn as BigIntColumn_, StringColumn as StringColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class Proposal {
    constructor(props?: Partial<Proposal>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @BigIntColumn_({nullable: false})
    proposalId!: bigint

    @StringColumn_({nullable: false})
    proposer!: string

    @StringColumn_({array: true, nullable: false})
    targets!: (string)[]

    @StringColumn_({array: true, nullable: false})
    values!: (string)[]

    @StringColumn_({array: true, nullable: false})
    signatures!: (string)[]

    @StringColumn_({array: true, nullable: false})
    calldatas!: (string)[]

    @BigIntColumn_({nullable: false})
    voteStart!: bigint

    @BigIntColumn_({nullable: false})
    voteEnd!: bigint

    @StringColumn_({nullable: false})
    description!: string

    @BigIntColumn_({nullable: false})
    blockNumber!: bigint

    @BigIntColumn_({nullable: false})
    blockTimestamp!: bigint

    @StringColumn_({nullable: false})
    transactionHash!: string

    @StringColumn_({array: true, nullable: false})
    participants!: (string)[]
}
