alter table public.web_sessions
  add column csrf_token_hash bytea;

update public.web_sessions
   set revoked_at = clock_timestamp(),
       revocation_reason = 'RECOVERY_INVALIDATION'
 where revoked_at is null;

alter table public.web_sessions
  add constraint web_sessions_csrf_token_hash_length
    check (csrf_token_hash is null or octet_length(csrf_token_hash) = 32),
  add constraint web_sessions_active_csrf_token_required
    check (csrf_token_hash is not null or revoked_at is not null);
