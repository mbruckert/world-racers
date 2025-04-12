use axum::{
    body::Body,
    extract::{FromRef, FromRequestParts, State},
    http::{StatusCode, request::Parts},
    middleware::Next,
    response::Response,
};
use http::{Request, header};

use crate::{Auth, Claims};

// Extract the JWT from the Authorization header and validate it
pub async fn auth_middleware<B, S>(
    State(state): State<S>,
    mut req: Request<B>,
    next: Next,
) -> Result<Response, StatusCode>
where
    Auth: FromRef<S>,
{
    // Extract the JWT from the Authorization header
    let auth_header = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|header| header.to_str().ok())
        .and_then(|value| {
            if value.starts_with("Bearer ") {
                Some(value[7..].to_owned())
            } else {
                None
            }
        });

    let token = match auth_header {
        Some(token) => token,
        None => return Err(StatusCode::UNAUTHORIZED),
    };
    let auth = Auth::from_ref(&state);

    // Validate the token
    let claims = match auth.verify_token(&token) {
        Ok(claims) => claims,
        Err(_) => return Err(StatusCode::UNAUTHORIZED),
    };

    // Store the claims in the request extensions so handlers can access them
    req.extensions_mut().insert(claims);

    // Pass the request to the next handler
    let response = next.run(req.map(|_| Body::empty())).await;
    Ok(response)
}

// Extractor for authenticated requests
pub struct AuthUser(pub Claims);

impl<S> FromRequestParts<S> for AuthUser
where
    S: Send + Sync,
{
    type Rejection = StatusCode;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        // Get the claims from the request extensions
        let claims = parts
            .extensions
            .get::<Claims>()
            .ok_or(StatusCode::UNAUTHORIZED)?;

        // Return the claims
        Ok(AuthUser(claims.clone()))
    }
}

// Optional auth user extractor - doesn't fail if no token is present
pub struct OptionalAuthUser(pub Option<Claims>);

impl<S> FromRequestParts<S> for OptionalAuthUser
where
    S: Send + Sync,
{
    type Rejection = StatusCode;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        // Get the claims from the request extensions if they exist
        let claims = parts.extensions.get::<Claims>().cloned();

        // Return the optional claims
        Ok(OptionalAuthUser(claims))
    }
}
