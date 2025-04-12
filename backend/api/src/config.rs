use std::env;
use thiserror::Error;

#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub redis_host: String,
    pub redis_port: u16,
    pub server_host: String,
    pub server_port: u16,
    pub jwt_secret: String,
    pub jwt_expiry: i64,     // in seconds
    pub refresh_expiry: i64, // in seconds
}

#[derive(Error, Debug)]
pub enum ConfigError {
    #[error("Environment variable {0} not found")]
    EnvVarNotFound(String),

    #[error("Failed to parse {0}: {1}")]
    ParseError(String, String),
}

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        dotenv::dotenv().ok();

        Ok(Self {
            database_url: get_env_var("DATABASE_URL")?,
            redis_host: get_env_var("REDIS_HOST")?,
            redis_port: parse_env_var::<u16>("REDIS_PORT")?,
            server_host: env::var("SERVER_HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            server_port: env::var("SERVER_PORT")
                .unwrap_or_else(|_| "8080".to_string())
                .parse::<u16>()
                .map_err(|e| ConfigError::ParseError("SERVER_PORT".to_string(), e.to_string()))?,
            jwt_secret: env::var("JWT_SECRET")
                .unwrap_or_else(|_| "your_jwt_secret_key_replace_in_production".to_string()),
            jwt_expiry: env::var("JWT_EXPIRY")
                .unwrap_or_else(|_| "3600".to_string()) // 1 hour default
                .parse::<i64>()
                .map_err(|e| ConfigError::ParseError("JWT_EXPIRY".to_string(), e.to_string()))?,
            refresh_expiry: env::var("REFRESH_EXPIRY")
                .unwrap_or_else(|_| "604800".to_string()) // 7 days default
                .parse::<i64>()
                .map_err(|e| {
                    ConfigError::ParseError("REFRESH_EXPIRY".to_string(), e.to_string())
                })?,
        })
    }
}

fn get_env_var(name: &str) -> Result<String, ConfigError> {
    env::var(name).map_err(|_| ConfigError::EnvVarNotFound(name.to_string()))
}

fn parse_env_var<T: std::str::FromStr>(name: &str) -> Result<T, ConfigError>
where
    T::Err: std::fmt::Display,
{
    let var = get_env_var(name)?;
    var.parse()
        .map_err(|e| ConfigError::ParseError(name.to_string(), format!("{}", e)))
}
