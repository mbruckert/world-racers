//! `SeaORM` Entity, @generated by sea-orm-codegen 1.1.8

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq, Serialize, Deserialize)]
#[sea_orm(table_name = "party")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    pub name: String,
    #[sea_orm(unique)]
    pub code: String,
    pub owner_id: i32,
    pub created_at: DateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::user::Entity",
        from = "Column::OwnerId",
        to = "super::user::Column::Id",
        on_update = "NoAction",
        on_delete = "NoAction"
    )]
    User,
    #[sea_orm(has_many = "super::user_party::Entity")]
    UserParty,
}

impl Related<super::user::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::User.def()
    }
}

impl Related<super::user_party::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::UserParty.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
