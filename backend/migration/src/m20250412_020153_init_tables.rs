use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Create the User table
        manager
            .create_table(
                Table::create()
                    .table(User::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(User::Id)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(User::Name).string().not_null())
                    .col(ColumnDef::new(User::CreatedAt).timestamp().not_null())
                    .to_owned(),
            )
            .await?;

        // Create the Party table
        manager
            .create_table(
                Table::create()
                    .table(Party::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Party::Id)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Party::Name).string().not_null())
                    .col(ColumnDef::new(Party::Code).string().not_null().unique_key())
                    .col(ColumnDef::new(Party::OwnerId).integer().not_null())
                    .col(ColumnDef::new(Party::CreatedAt).timestamp().not_null())
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_party_owner")
                            .from(Party::Table, Party::OwnerId)
                            .to(User::Table, User::Id),
                    )
                    .to_owned(),
            )
            .await?;

        // Create the UserParty table
        manager
            .create_table(
                Table::create()
                    .table(UserParty::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(UserParty::Id)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(UserParty::UserId).integer().not_null())
                    .col(ColumnDef::new(UserParty::PartyId).integer().not_null())
                    .col(ColumnDef::new(UserParty::JoinedAt).timestamp().not_null())
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_user_party_user")
                            .from(UserParty::Table, UserParty::UserId)
                            .to(User::Table, User::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_user_party_party")
                            .from(UserParty::Table, UserParty::PartyId)
                            .to(Party::Table, Party::Id),
                    )
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(UserParty::Table).to_owned())
            .await?;

        manager
            .drop_table(Table::drop().table(User::Table).to_owned())
            .await?;

        manager
            .drop_table(Table::drop().table(Party::Table).to_owned())
            .await?;

        Ok(())
    }
}

#[derive(DeriveIden)]
enum User {
    Table,
    Id,
    Name,
    CreatedAt,
}

#[derive(DeriveIden)]
enum Party {
    Table,
    Id,
    Name,
    Code,
    OwnerId,
    CreatedAt,
}

#[derive(DeriveIden)]
enum UserParty {
    Table,
    Id,
    UserId,
    PartyId,
    JoinedAt,
}
