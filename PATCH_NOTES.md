# V7.2.0 Patch Notes

- Fixed localized accessibility-label pollution such as `的头像` being written into `group_name`.
- Added `scripts/group_name_utils.js` with multilingual avatar/profile-picture wrapper removal, source-aware scoring, and Phase 2 name selection.
- Visible headings and visible links now outrank `aria-label` and image `alt`; accessibility labels remain fallback evidence only.
- Phase 1 records `phase1_name_source`, `phase1_name_raw`, `phase1_name_normalization`, `phase1_name_score`, and `phase1_query_token_match`.
- Phase 2 sanitizes legacy Phase 1 names before prefiltering, prefers a valid About-page heading, and recalculates language from the cleaned name and Facebook evidence.
- Non-finalized checkpoint rows with avatar-label pollution are sanitized on resume; false Chinese labels are conservatively recalculated.
- `finalize_partial_xlsx.js` now sanitizes avatar-label pollution during recovery finalization.
- Added `repair_avatar_name_pollution_xlsx.js` for already generated workbooks; it writes a new workbook plus an audit sheet and never overwrites the input.
- Preserved V7.0.1 dual-route Phase 1 recovery and diagnostics.
- Preserved V7.1.0 script-aware boundaries, including English titles directly adjacent to Chinese, Thai, Lao, Arabic, Korean, and other non-Latin scripts while continuing to reject Latin/digit continuations such as `GAGS`, `GAG2`, `DefenseX`, and `99100`.

---

# V6.6.4 Patch Notes

- Fixed same-business-region evidence loss when country keywords and flag emoji independently collapse several countries into one business region.
- A group name containing Laos and Thailand evidence now resolves directly to `SEA` with source `country_keyword_and_flag_same_business_region` instead of being cleared by the multi-region adjudication path.
- Replaced unrestricted compact substring matching for short Latin aliases with token-boundary matching.
- Short aliases such as `GAG` no longer match `gags`, `gagged`, `9gag`, `GAG2`, or `GAG 2`.
- Alphanumeric aliases such as `GAG2` accept both compact and separated forms, including `GAG2`, `GAG 2`, and punctuation-separated equivalents.
- Sibling-title exclusion now includes sibling aliases and configured title variants, not only canonical sibling titles.
- `Grow a Garden 2`, `GAG2`, and `GAG 2` therefore exclude a false `Grow a Garden` match while remaining valid for `Grow a Garden 2`.
- A group that explicitly contains two genuinely distinct titles can still be retained once under each game under the existing `group_url + game_name` rule.
- Non-finalized checkpoints are conservatively revalidated on resume. Previously staged rows whose strong group-name match is invalid under the current title rules are removed and counted in resume audit statistics.
- Preserved the authoritative XLSX field order, supervisor-log isolation, multi-game output, Node-verified shutdown, API-first semantic chain, BOM-safe JSON, and prompt-driven shutdown behavior.
