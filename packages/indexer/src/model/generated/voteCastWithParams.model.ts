import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, IntColumn as IntColumn_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class VoteCastWithParams {
    constructor(props?: Partial<VoteCastWithParams>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @StringColumn_({nullable: false})
    voter!: string

    @StringColumn_({nullable: false})
    proposalId!: string

    @IntColumn_({nullable: false})
    support!: number

    @BigIntColumn_({nullable: false})
    weight!: bigint

    @StringColumn_({nullable: false})
    reason!: string

    @StringColumn_({nullable: false})
    params!: string

    @BigIntColumn_({nullable: false})
    blockNumber!: bigint

    @BigIntColumn_({nullable: false})
    blockTimestamp!: bigint

    @StringColumn_({nullable: false})
    transactionHash!: string
}
