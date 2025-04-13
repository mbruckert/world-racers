pub use sea_orm_migration::prelude::*;

mod m20250412_020153_init_tables;
mod m20250412_022647_add_map_table;
mod m20250412_035913_make_created_at_columns_default_to_now;
mod m20250412_040907_make_joined_at_columns_default_to_now;
mod m20250413_062158_add_map_id_to_party;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20250412_020153_init_tables::Migration),
            Box::new(m20250412_022647_add_map_table::Migration),
            Box::new(m20250412_035913_make_created_at_columns_default_to_now::Migration),
            Box::new(m20250412_040907_make_joined_at_columns_default_to_now::Migration),
            Box::new(m20250413_062158_add_map_id_to_party::Migration),
        ]
    }
}
