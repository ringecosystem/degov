import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class Delegate {
    constructor(props?: Partial<Delegate>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @StringColumn_({nullable: false})
    delegator!: string

    @StringColumn_({nullable: false})
    fromDelegate!: string

    @StringColumn_({nullable: false})
    toDelegate!: string

    @BigIntColumn_({nullable: false})
    blockNumber!: bigint

    @BigIntColumn_({nullable: false})
    blockTimestamp!: bigint

    @StringColumn_({nullable: false})
    transactionHash!: string

    @BigIntColumn_({nullable: true})
    fromPreviousVotes!: bigint | undefined | null

    @BigIntColumn_({nullable: true})
    fromNewVotes!: bigint | undefined | null

    @BigIntColumn_({nullable: true})
    toPreviousVotes!: bigint | undefined | null

    @BigIntColumn_({nullable: true})
    toNewVotes!: bigint | undefined | null
}
