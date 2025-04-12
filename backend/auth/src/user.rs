use entity::user;
use sea_orm::DatabaseConnection;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};
use serde::{Deserialize, Serialize};

use crate::{Auth, AuthError, AuthResponse};

#[derive(Debug, Serialize, Deserialize, utoipa::ToSchema)]
pub struct RegisterRequest {
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize, utoipa::ToSchema)]
pub struct LoginRequest {
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize, utoipa::ToSchema)]
pub struct RefreshRequest {
    pub refresh_token: String,
}

/// Register a new user
pub async fn register(
    db: &DatabaseConnection,
    auth: &Auth,
    req: RegisterRequest,
) -> Result<AuthResponse, AuthError> {
    // Create user
    let new_user = user::ActiveModel {
        name: Set(req.name.clone()),
        ..Default::default()
    };

    let user = new_user
        .insert(db)
        .await
        .map_err(|e| AuthError::DatabaseError(e.to_string()))?;

    // Generate tokens
    let tokens = auth.generate_tokens(user.id, user.name)?;

    Ok(tokens)
}

/// Login a user
pub async fn login(
    db: &DatabaseConnection,
    auth: &Auth,
    req: LoginRequest,
) -> Result<AuthResponse, AuthError> {
    // Find user by name
    let user = user::Entity::find()
        .filter(user::Column::Name.eq(req.name))
        .one(db)
        .await
        .map_err(|e| AuthError::DatabaseError(e.to_string()))?
        .ok_or(AuthError::InvalidCredentials)?;

    // Generate tokens
    let tokens = auth.generate_tokens(user.id, user.name)?;

    Ok(tokens)
}

/// Refresh an access token
pub async fn refresh_token(
    db: &DatabaseConnection,
    auth: &Auth,
    req: RefreshRequest,
) -> Result<AuthResponse, AuthError> {
    // Validate refresh token
    let claims = auth.verify_refresh_token(&req.refresh_token)?;

    // Get user
    let user = user::Entity::find_by_id(claims.sub)
        .one(db)
        .await
        .map_err(|e| AuthError::DatabaseError(e.to_string()))?
        .ok_or(AuthError::InvalidToken)?;

    // Generate new tokens
    let tokens = auth.generate_tokens(user.id, user.name)?;

    Ok(tokens)
}
