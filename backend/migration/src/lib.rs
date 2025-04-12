pub use sea_orm_migration::prelude::*;

mod m20250412_020153_init_tables;
mod m20250412_022647_add_map_table;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20250412_020153_init_tables::Migration),
            Box::new(m20250412_022647_add_map_table::Migration),
        ]
    }
}
