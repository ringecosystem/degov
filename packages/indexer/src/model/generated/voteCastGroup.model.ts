import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, StringColumn as StringColumn_, IntColumn as IntColumn_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"
import {Proposal} from "./proposal.model"

@Entity_()
export class VoteCastGroup {
    constructor(props?: Partial<VoteCastGroup>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_()
    @ManyToOne_(() => Proposal, {nullable: true})
    proposal!: Proposal

    @StringColumn_({nullable: false})
    type!: string

    @StringColumn_({nullable: false})
    voter!: string

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
