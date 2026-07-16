# Auth and comments compatibility contract

## Production baseline

The Phase 0 inventory was captured from Supabase project `znurdobjryrhshzkalup` before the
community hardening migration.

| Record set   | Rows | Public destination                                                      |
| ------------ | ---: | ----------------------------------------------------------------------- |
| Profiles     |    2 | Used only to attribute visible page comments                            |
| Comments     |   13 | 2 page comments are restored; 11 Gallery/Video comments remain archived |
| Favorites    |   14 | Preserved in the database; Gallery/Video UI is outside this rollout     |
| Entity state |   14 | Preserved as private user state                                         |
| Annotations  |    0 | Preserved as private user state                                         |

The private public-schema data dump is stored outside the repository. Its Phase 0 SHA-256 was
`df2e7b27833c807e31d18bd16d768022fa21a495bddb8b436e45055f651456d4` (8,598 bytes). The dump is a
same-project forward-recovery aid, not a standalone Supabase disaster-recovery backup because it
does not include `auth.users`.

## Thread identity

- Article threads use `page:<canonical-route>`.
- Routes retain their leading and trailing slash.
- An English page with a Chinese alternate uses the Chinese canonical route so both languages share
  a discussion.
- Route values are not lowercased, URL-decoded, or inferred from `window.location.pathname`.
- New public writes are accepted only for `page:/.../` threads.
- Historical `ai-gallery:*` and `ai-video:*` rows remain in the base table but are excluded from the
  public read RPC.

## Comment semantics

Root comments retain the legacy types `question`, `repro`, and `suggestion`. Replies always use
`reply`. `repro` continues to mean “复现反馈 / Repro feedback”; it is not relabeled as an erratum.

## Security boundary

- Browsers can execute only the parameter-validated `public.get_page_comments(text, uuid)` reader.
- Browsers cannot select or mutate `public.comments` directly.
- The Community API validates the Supabase user and calls service-role-only RPCs.
- A database kill switch defaults to off and remains authoritative during frontend rollback.
- Gallery/Video comments and favorites are retained, not deleted and not restored in this rollout.
- Legacy favorites, entity state, and annotations remain readable by their owners, but browsers
  cannot insert, update, or delete them until a future product surface restores those operations
  behind a bounded API.
