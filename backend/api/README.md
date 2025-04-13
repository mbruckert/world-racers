# API Authentication with AuthUser

This document explains how to use the `AuthUser` middleware in API handlers.

## Overview

The API now uses the `auth_middleware` to protect authenticated routes. The middleware:

1. Extracts JWT tokens from the Authorization header
2. Validates the token
3. Makes the token claims available to handlers via the `AuthUser` extractor

## Usage

### Protected Routes

All routes are now protected by the auth middleware except:
- `/api/health/*` - Health check endpoints
- `/api/auth/*` - Authentication endpoints
- Swagger UI endpoints

### Using AuthUser in Route Handlers

To access the authenticated user in a handler, add the `AuthUser` extractor to your function parameters:

```rust
use auth::middleware::AuthUser;

async fn my_handler(
    State(state): State<AppState>,
    auth_user: AuthUser,
    // other parameters...
) -> Result<StatusCode, (StatusCode, String)> {
    // Access user ID from claims
    let user_id = auth_user.0.sub as i32;
    
    // Your handler logic...
}
```

The `AuthUser` struct wraps a `Claims` object which contains:
- `sub`: The subject (user ID)
- Other standard JWT claims

### Optional Authentication

For endpoints that can work with or without authentication, use the `OptionalAuthUser` extractor:

```rust
use auth::middleware::OptionalAuthUser;

async fn my_handler(
    State(state): State<AppState>,
    optional_auth: OptionalAuthUser,
) -> Result<StatusCode, (StatusCode, String)> {
    // Check if user is authenticated
    if let Some(claims) = optional_auth.0 {
        // User is authenticated
        let user_id = claims.sub as i32;
        // Authenticated user logic...
    } else {
        // User is not authenticated
        // Anonymous user logic...
    }
    
    // Your handler logic...
}
```

## Implementation Details

The authentication middleware is applied in `backend/api/src/api/mod.rs` and protects all API routes except those explicitly marked as public. 