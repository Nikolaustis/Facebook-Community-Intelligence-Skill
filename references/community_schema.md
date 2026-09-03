# Community Intelligence schema

The normalized model is `Subject ↔ Community ↔ Match`.

`Community` is the first-class Facebook Group entity. A Community is stored once by canonical URL and may be related to many Subjects.

## subjects
`subject_id`, `subject_name`, `subject_type`, `parent_subject`, `aliases`, `ip_roots`, `relationships`, `discovery`.

Supported subject types: `game`, `brand`, `product`, `app`, `creator`, `company`, `topic`, `event`, `competitor`, `franchise`, `custom`.

## communities
`community_id`, `platform`, `community_type`, `name`, `url`, `members`, `posts_today`, `new_members_week`, `language`, `region`.

## community_subject_matches
`community_id`, `subject_id`, `match_type`, `confidence`, `evidence`, `status`.

## community_evidence
Evidence is keyed independently from a Subject so validated Facebook Group facts can be reused across multiple Subject matches.
