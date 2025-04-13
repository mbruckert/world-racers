use sea_orm_migration::{prelude::*, schema::*};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Delete all existing parties first
        let db = manager.get_connection();
        db.execute_unprepared("DELETE FROM user_party").await?;
        db.execute_unprepared("DELETE FROM party").await?;

        // Add map_id column to party table
        manager
            .alter_table(
                Table::alter()
                    .table(Party::Table)
                    .add_column(ColumnDef::new(Party::MapId).integer().not_null())
                    .add_foreign_key(
                        TableForeignKey::new()
                            .name("fk_party_map")
                            .from_tbl(Party::Table)
                            .from_col(Party::MapId)
                            .to_tbl(Map::Table)
                            .to_col(Map::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Remove map_id column from party table
        manager
            .alter_table(
                Table::alter()
                    .table(Party::Table)
                    .drop_foreign_key(Alias::new("fk_party_map"))
                    .drop_column(Party::MapId)
                    .to_owned(),
            )
            .await
    }
}

#[derive(DeriveIden)]
enum Party {
    Table,
    MapId,
}

#[derive(DeriveIden)]
enum Map {
    Table,
    Id,
}
