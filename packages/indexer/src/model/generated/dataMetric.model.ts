import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, IntColumn as IntColumn_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class DataMetric {
    constructor(props?: Partial<DataMetric>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @IntColumn_({nullable: true})
    proposalsCount!: number | undefined | null

    @IntColumn_({nullable: true})
    votesCount!: number | undefined | null

    @IntColumn_({nullable: true})
    votesWithParamsCount!: number | undefined | null

    @IntColumn_({nullable: true})
    votesWithoutParamsCount!: number | undefined | null

    @BigIntColumn_({nullable: true})
    votesWeightForSum!: bigint | undefined | null

    @BigIntColumn_({nullable: true})
    votesWeightAgainstSum!: bigint | undefined | null

    @BigIntColumn_({nullable: true})
    votesWeightAbstainSum!: bigint | undefined | null

    @BigIntColumn_({nullable: true})
    powerSum!: bigint | undefined | null

    @IntColumn_({nullable: true})
    memberCount!: number | undefined | null
}
