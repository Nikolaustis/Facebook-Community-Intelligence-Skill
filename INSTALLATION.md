# Installation and migration

## Fresh installation

```powershell
npm ci
npm run doctor
npm test
npm run login
npm run validate-login
```

Copy `assets/subject_config.template.json` to a working config.

```powershell
npm run intelligence -- --config .\subject_config.json --out-dir .\runs\example
```

## Existing game configuration

A config with `games`, `aliases`, `sibling_titles`, `ip_roots`, and `title_variant_overrides` is migrated in memory.

To write a persistent Subject-form config:

```powershell
npm run config:migrate -- --input .\task_config.json --output .\subject_config.json
```

## Validation after repository update

```powershell
npm ci
npm test
npm run benchmark:check
```

CI parses PowerShell entrypoints with PowerShell 7.
