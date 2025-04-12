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
                    .table(User::Table)
                    .modify_column(
                        ColumnDef::new(User::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .to_owned(),
            )
            .await?;

        // Update Party table to make CreatedAt default to current timestamp
        manager
            .alter_table(
                Table::alter()
                    .table(Party::Table)
                    .modify_column(
                        ColumnDef::new(Party::CreatedAt)
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
                    .table(User::Table)
                    .modify_column(
                        ColumnDef::new(User::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .to_owned(),
            )
            .await?;

        // Remove default current_timestamp from Party table
        manager
            .alter_table(
                Table::alter()
                    .table(Party::Table)
                    .modify_column(
                        ColumnDef::new(Party::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}


#[derive(DeriveIden)]
enum User {
    Table,
    CreatedAt,
}

#[derive(DeriveIden)]
enum Party {
    Table,
    CreatedAt,
}

