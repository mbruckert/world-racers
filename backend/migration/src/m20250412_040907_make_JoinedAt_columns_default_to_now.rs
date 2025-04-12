use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Update User table to make CreatedAt default to current timestamp
        manager
            .alter_table(
                Table::alter()
                    .table(UserParty::Table)
                    .modify_column(
                        ColumnDef::new(UserParty::JoinedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Remove default current_timestamp from User table
        manager
            .alter_table(
                Table::alter()
                    .table(UserParty::Table)
                    .modify_column(ColumnDef::new(UserParty::JoinedAt).timestamp().not_null())
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}

#[derive(DeriveIden)]
enum UserParty {
    Table,
    JoinedAt,
}
