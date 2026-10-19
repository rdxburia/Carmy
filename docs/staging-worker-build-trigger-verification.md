# Staging Worker build-trigger verification

This documentation-only commit verifies that the `carmy-api-staging` Workers Builds trigger deploys with `wrangler.staging.toml`. After the build completes, verify the active version is bound only to the dedicated staging D1, R2 bucket, rate-limit namespace, and Supabase project before any authenticated E2E calls.
