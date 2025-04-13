use crate::{Auth, Claims};
use axum::{
    RequestPartsExt,
    body::{Body, HttpBody},
    extract::{FromRef, FromRequestParts, State},
    http::{StatusCode, request::Parts},
    middleware::Next,
    response::Response,
};
use axum_extra::{
    TypedHeader,
    headers::{Authorization, authorization::Bearer},
};
use http::{Request, header};

// Extractor for authenticated requests
#[derive(Debug, Clone)]
pub struct AuthUser(pub Claims);

impl<S> FromRequestParts<S> for AuthUser
where
    Auth: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = StatusCode;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        // Get the claims from the request extensions
        let TypedHeader(Authorization(bearer)) = parts
            .extract::<TypedHeader<Authorization<Bearer>>>()
            .await
            .map_err(|_| StatusCode::UNAUTHORIZED)?;

        let auth = Auth::from_ref(state);

        // Validate the token
        let claims = match auth.verify_token(bearer.token()) {
            Ok(claims) => claims,
            Err(_) => return Err(StatusCode::UNAUTHORIZED),
        };

        // Return the claims
        Ok(AuthUser(claims))
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
