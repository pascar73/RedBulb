import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DummyValue, GenerateSql } from 'src/decorators';
import { DB } from 'src/schema';

const MAX_VERSIONS_PER_ASSET = 30;

export interface DevelopHistoryRow {
  id: string;
  assetId: string;
  userId: string;
  version: number;
  label: string;
  state: Record<string, unknown>;
  isCurrent: boolean;
  isAutoCheckpoint: boolean;
  thumbnail: Buffer | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class DevelopHistoryRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  @GenerateSql({ params: [DummyValue.UUID] })
  async getAll(assetId: string): Promise<DevelopHistoryRow[]> {
    return this.db
      .selectFrom('asset_develop_history')
      .selectAll()
      .where('assetId', '=', assetId)
      .orderBy('version', 'desc')
      .execute() as Promise<DevelopHistoryRow[]>;
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  async getAllSummary(assetId: string): Promise<Omit<DevelopHistoryRow, 'state' | 'thumbnail'>[]> {
    return this.db
      .selectFrom('asset_develop_history')
      .select([
        'id',
        'assetId',
        'userId',
        'version',
        'label',
        'isCurrent',
        'isAutoCheckpoint',
        'createdAt',
        'updatedAt',
      ])
      .where('assetId', '=', assetId)
      .orderBy('version', 'desc')
      .execute() as any;
  }

  @GenerateSql({ params: [DummyValue.UUID, 1] })
  async getByVersion(assetId: string, version: number): Promise<DevelopHistoryRow | undefined> {
    return this.db
      .selectFrom('asset_develop_history')
      .selectAll()
      .where('assetId', '=', assetId)
      .where('version', '=', version)
      .executeTakeFirst() as Promise<DevelopHistoryRow | undefined>;
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  async getCurrent(assetId: string): Promise<DevelopHistoryRow | undefined> {
    return this.db
      .selectFrom('asset_develop_history')
      .selectAll()
      .where('assetId', '=', assetId)
      .where('isCurrent', '=', true)
      .executeTakeFirst() as Promise<DevelopHistoryRow | undefined>;
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  async getNextVersion(assetId: string): Promise<number> {
    const result = await this.db
      .selectFrom('asset_develop_history')
      .select(sql<number>`coalesce(max(version), 0) + 1`.as('nextVersion'))
      .where('assetId', '=', assetId)
      .executeTakeFirst();
    return result?.nextVersion ?? 1;
  }

  async create(data: {
    assetId: string;
    userId: string;
    version: number;
    label: string;
    state: Record<string, unknown>;
    isCurrent: boolean;
    isAutoCheckpoint: boolean;
    thumbnail: Buffer | null;
  }): Promise<DevelopHistoryRow> {
    return this.db.transaction().execute(async (trx) => {
      // If setting as current, unset any existing current
      if (data.isCurrent) {
        await trx
          .updateTable('asset_develop_history')
          .set({ isCurrent: false })
          .where('assetId', '=', data.assetId)
          .where('isCurrent', '=', true)
          .execute();
      }

      // Insert the new version
      const row = await trx
        .insertInto('asset_develop_history')
        .values({
          assetId: data.assetId,
          userId: data.userId,
          version: data.version,
          label: data.label,
          state: JSON.stringify(data.state) as any,
          isCurrent: data.isCurrent,
          isAutoCheckpoint: data.isAutoCheckpoint,
          thumbnail: data.thumbnail,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Enforce max versions per asset — prune oldest auto-checkpoints first
      await this.pruneVersions(trx, data.assetId);

      return row as unknown as DevelopHistoryRow;
    });
  }

  async setCurrent(assetId: string, version: number): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      // Unset current
      await trx
        .updateTable('asset_develop_history')
        .set({ isCurrent: false })
        .where('assetId', '=', assetId)
        .where('isCurrent', '=', true)
        .execute();

      // Set new current
      await trx
        .updateTable('asset_develop_history')
        .set({ isCurrent: true })
        .where('assetId', '=', assetId)
        .where('version', '=', version)
        .execute();
    });
  }

  @GenerateSql({ params: [DummyValue.UUID, 1] })
  async deleteVersion(assetId: string, version: number): Promise<void> {
    await this.db
      .deleteFrom('asset_develop_history')
      .where('assetId', '=', assetId)
      .where('version', '=', version)
      .execute();
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  async deleteAll(assetId: string): Promise<void> {
    await this.db.deleteFrom('asset_develop_history').where('assetId', '=', assetId).execute();
  }

  @GenerateSql({ params: [DummyValue.UUID, 1] })
  async getThumbnail(assetId: string, version: number): Promise<Buffer | null> {
    const row = await this.db
      .selectFrom('asset_develop_history')
      .select('thumbnail')
      .where('assetId', '=', assetId)
      .where('version', '=', version)
      .executeTakeFirst();
    return (row?.thumbnail as Buffer | null) ?? null;
  }

  async updateLabel(assetId: string, version: number, label: string): Promise<void> {
    await this.db
      .updateTable('asset_develop_history')
      .set({ label })
      .where('assetId', '=', assetId)
      .where('version', '=', version)
      .execute();
  }

  private async pruneVersions(trx: Kysely<DB>, assetId: string): Promise<void> {
    const count = await trx
      .selectFrom('asset_develop_history')
      .select(sql<number>`count(*)`.as('count'))
      .where('assetId', '=', assetId)
      .executeTakeFirst();

    const total = Number(count?.count ?? 0);
    if (total <= MAX_VERSIONS_PER_ASSET) return;

    const excess = total - MAX_VERSIONS_PER_ASSET;

    // Delete oldest auto-checkpoints first
    const autoCheckpointsToDelete = await trx
      .selectFrom('asset_develop_history')
      .select('id')
      .where('assetId', '=', assetId)
      .where('isAutoCheckpoint', '=', true)
      .where('isCurrent', '=', false)
      .orderBy('version', 'asc')
      .limit(excess)
      .execute();

    if (autoCheckpointsToDelete.length > 0) {
      await trx
        .deleteFrom('asset_develop_history')
        .where(
          'id',
          'in',
          autoCheckpointsToDelete.map((r) => r.id),
        )
        .execute();
    }

    // If still over limit, delete oldest non-current versions
    const remainingCount = await trx
      .selectFrom('asset_develop_history')
      .select(sql<number>`count(*)`.as('count'))
      .where('assetId', '=', assetId)
      .executeTakeFirst();

    const remaining = Number(remainingCount?.count ?? 0);
    if (remaining <= MAX_VERSIONS_PER_ASSET) return;

    const stillExcess = remaining - MAX_VERSIONS_PER_ASSET;
    const oldestToDelete = await trx
      .selectFrom('asset_develop_history')
      .select('id')
      .where('assetId', '=', assetId)
      .where('isCurrent', '=', false)
      .orderBy('version', 'asc')
      .limit(stillExcess)
      .execute();

    if (oldestToDelete.length > 0) {
      await trx
        .deleteFrom('asset_develop_history')
        .where(
          'id',
          'in',
          oldestToDelete.map((r) => r.id),
        )
        .execute();
    }
  }
}
