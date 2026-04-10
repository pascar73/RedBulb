import {
  Column,
  CreateDateColumn,
  ForeignKeyColumn,
  Generated,
  PrimaryGeneratedColumn,
  Table,
  Timestamp,
  Unique,
  UpdateDateColumn,
} from '@immich/sql-tools';
import { UpdatedAtTrigger } from 'src/decorators';
import { AssetTable } from 'src/schema/tables/asset.table';
import { UserTable } from 'src/schema/tables/user.table';

@Table('asset_develop_history')
@UpdatedAtTrigger('asset_develop_history_updatedAt')
@Unique({ columns: ['assetId', 'version'] })
export class AssetDevelopHistoryTable {
  @PrimaryGeneratedColumn()
  id!: Generated<string>;

  @ForeignKeyColumn(() => AssetTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE', nullable: false })
  assetId!: string;

  @ForeignKeyColumn(() => UserTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE', nullable: false })
  userId!: string;

  @Column({ type: 'integer' })
  version!: number;

  @Column({ type: 'varchar', length: 255, default: "''" })
  label!: string;

  @Column({ type: 'jsonb' })
  state!: Record<string, unknown>;

  @Column({ type: 'boolean', default: 'false' })
  isCurrent!: Generated<boolean>;

  @Column({ type: 'boolean', default: 'false' })
  isAutoCheckpoint!: Generated<boolean>;

  @Column({ type: 'bytea', nullable: true })
  thumbnail!: Buffer | null;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;

  @UpdateDateColumn()
  updatedAt!: Generated<Timestamp>;
}
