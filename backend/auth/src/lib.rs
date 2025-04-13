use chrono::{Duration, Utc};
use jsonwebtoken::{DecodingKey, EncodingKey, Header, Validation, decode, encode};
use serde::{Deserialize, Serialize};
use thiserror::Error;

pub mod middleware;
pub mod user;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: i32,     // Subject (user id)
    pub exp: usize,   // Expiration time
    pub iat: usize,   // Issued at
    pub name: String, // User name
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RefreshClaims {
    pub sub: i32,           // Subject (user id)
    pub exp: usize,         // Expiration time
    pub iat: usize,         // Issued at
    pub token_type: String, // To distinguish refresh tokens
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: i64,
    pub token_type: String,
}

#[derive(Debug, Error)]
pub enum AuthError {
    #[error("Invalid credentials")]
    InvalidCredentials,

    #[error("JWT error: {0}")]
    JwtError(#[from] jsonwebtoken::errors::Error),

    #[error("Token expired")]
    TokenExpired,

    #[error("Invalid token")]
    InvalidToken,

    #[error("Database error: {0}")]
    DatabaseError(String),

    #[error("Refresh token expired")]
    RefreshTokenExpired,

    #[error("Internal error: {0}")]
    InternalError(String),
}

#[derive(Debug, Clone)]
pub struct Auth {
    jwt_secret: String,
    jwt_expiry: i64,     // in seconds
    refresh_expiry: i64, // in seconds
}

impl Auth {
    pub fn new(jwt_secret: String, jwt_expiry: i64, refresh_expiry: i64) -> Self {
        Self {
            jwt_secret,
            jwt_expiry,
            refresh_expiry,
        }
    }

    pub fn generate_tokens(&self, user_id: i32, name: String) -> Result<AuthResponse, AuthError> {
        let now = Utc::now();
        let jwt_expiry = now + Duration::seconds(self.jwt_expiry);
        let refresh_expiry = now + Duration::seconds(self.refresh_expiry);

        // Access token claims
        let access_claims = Claims {
            sub: user_id,
            exp: jwt_expiry.timestamp() as usize,
            iat: now.timestamp() as usize,
            name,
        };

        // Refresh token claims
        let refresh_claims = RefreshClaims {
            sub: user_id,
            exp: refresh_expiry.timestamp() as usize,
            iat: now.timestamp() as usize,
            token_type: "refresh".to_string(),
        };

        // Generate access token
        let access_token = encode(
            &Header::default(),
            &access_claims,
            &EncodingKey::from_secret(self.jwt_secret.as_bytes()),
        )?;

        // Generate refresh token
        let refresh_token = encode(
            &Header::default(),
            &refresh_claims,
            &EncodingKey::from_secret(self.jwt_secret.as_bytes()),
        )?;

        Ok(AuthResponse {
            access_token,
            refresh_token,
            expires_in: self.jwt_expiry,
            token_type: "Bearer".to_string(),
        })
    }

    pub fn verify_token(&self, token: &str) -> Result<Claims, AuthError> {
        let validation = Validation::default();
        let token_data = decode::<Claims>(
            token,
            &DecodingKey::from_secret(self.jwt_secret.as_bytes()),
            &validation,
        )?;

        Ok(token_data.claims)
    }

    pub fn verify_refresh_token(&self, token: &str) -> Result<RefreshClaims, AuthError> {
        let validation = Validation::default();
        let token_data = decode::<RefreshClaims>(
            token,
            &DecodingKey::from_secret(self.jwt_secret.as_bytes()),
            &validation,
        )?;

        // Verify this is actually a refresh token
        if token_data.claims.token_type != "refresh" {
            return Err(AuthError::InvalidToken);
        }

        Ok(token_data.claims)
    }
}

// This will be implemented in the API crate where AppState is defined
#[macro_export]
macro_rules! impl_auth_from_ref {
    ($state:ty) => {
        impl axum::extract::FromRef<$state> for $crate::Auth {
            fn from_ref(state: &$state) -> Self {
                Self::new(
                    state.config.jwt_secret.clone(),
                    state.config.jwt_expiry,
                    state.config.refresh_expiry,
                )
            }
        }
    };
}
