use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Create Map table
        manager
            .create_table(
                Table::create()
                    .table(Map::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Map::Id)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Map::Title).string().not_null())
                    .col(ColumnDef::new(Map::Description).string().not_null())
                    .col(
                        ColumnDef::new(Map::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .col(ColumnDef::new(Map::AuthorId).integer().not_null())
                    .col(ColumnDef::new(Map::StartLatitude).float().not_null())
                    .col(ColumnDef::new(Map::StartLongitude).float().not_null())
                    .col(ColumnDef::new(Map::EndLatitude).float().not_null())
                    .col(ColumnDef::new(Map::EndLongitude).float().not_null())
                    .col(
                        ColumnDef::new(Map::CheckpointCount)
                            .integer()
                            .not_null()
                            .default(0),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(Map::Table, Map::AuthorId)
                            .to(User::Table, User::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // Create Checkpoint table
        manager
            .create_table(
                Table::create()
                    .table(Checkpoint::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Checkpoint::Id)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Checkpoint::MapId).integer().not_null())
                    .col(ColumnDef::new(Checkpoint::Latitude).float().not_null())
                    .col(ColumnDef::new(Checkpoint::Longitude).float().not_null())
                    .col(ColumnDef::new(Checkpoint::Position).integer().not_null())
                    .foreign_key(
                        ForeignKey::create()
                            .from(Checkpoint::Table, Checkpoint::MapId)
                            .to(Map::Table, Map::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // Create index for quick checkpoint lookup by map and position
        manager
            .create_index(
                Index::create()
                    .name("idx_checkpoint_map_position")
                    .table(Checkpoint::Table)
                    .col(Checkpoint::MapId)
                    .col(Checkpoint::Position)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Checkpoint::Table).to_owned())
            .await?;

        manager
            .drop_table(Table::drop().table(Map::Table).to_owned())
            .await?;

        Ok(())
    }
}

#[derive(DeriveIden)]
enum Map {
    Table,
    Id,
    Title,
    Description,
    CreatedAt,
    AuthorId,

    StartLatitude,
    StartLongitude,

    EndLatitude,
    EndLongitude,

    CheckpointCount,
}

#[derive(DeriveIden)]
enum Checkpoint {
    Table,
    Id,
    MapId,
    Latitude,
    Longitude,
    Position,
}

#[derive(DeriveIden)]
enum User {
    Table,
    Id,
}
