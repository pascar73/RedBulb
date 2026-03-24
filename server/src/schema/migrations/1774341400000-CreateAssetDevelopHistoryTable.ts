import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('asset_develop_history')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('assetId', 'uuid', (col) => col.notNull().references('asset.id').onDelete('cascade').onUpdate('cascade'))
    .addColumn('userId', 'uuid', (col) => col.notNull().references('user.id').onDelete('cascade').onUpdate('cascade'))
    .addColumn('version', 'integer', (col) => col.notNull())
    .addColumn('label', 'varchar(255)', (col) => col.notNull().defaultTo(''))
    .addColumn('state', 'jsonb', (col) => col.notNull())
    .addColumn('isCurrent', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('isAutoCheckpoint', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('thumbnail', 'bytea')
    .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Unique constraint: one version number per asset
  await db.schema
    .createIndex('idx_asset_develop_history_asset_version')
    .on('asset_develop_history')
    .columns(['assetId', 'version'])
    .unique()
    .execute();

  // Index for fast lookups by asset
  await db.schema
    .createIndex('idx_asset_develop_history_asset_id')
    .on('asset_develop_history')
    .column('assetId')
    .execute();

  // Index for finding current version quickly
  await db.schema
    .createIndex('idx_asset_develop_history_current')
    .on('asset_develop_history')
    .columns(['assetId', 'isCurrent'])
    .where('isCurrent', '=', true)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('asset_develop_history').ifExists().execute();
}
