import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, BigIntColumn as BigIntColumn_, IntColumn as IntColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class VoteCastGroup {
    constructor(props?: Partial<VoteCastGroup>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @StringColumn_({nullable: false})
    type!: string

    @StringColumn_({nullable: false})
    voter!: string

    @BigIntColumn_({nullable: false})
    proposalId!: bigint

    @IntColumn_({nullable: false})
    support!: number

    @BigIntColumn_({nullable: false})
    weight!: bigint

    @StringColumn_({nullable: false})
    reason!: string

    @StringColumn_({nullable: true})
    params!: string | undefined | null

    @BigIntColumn_({nullable: false})
    blockNumber!: bigint

    @BigIntColumn_({nullable: false})
    blockTimestamp!: bigint

    @StringColumn_({nullable: false})
    transactionHash!: string
}
