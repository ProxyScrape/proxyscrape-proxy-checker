---
description: MUI v6 TextField prop changes — use slotProps instead of InputProps
globs: **/*.jsx
alwaysApply: false
---

# MUI v6: TextField `InputProps` → `slotProps`

In MUI v6, `InputProps` was removed from `TextField`. Using it causes a React warning:
> "React does not recognize the `InputProps` prop on a DOM element."

## Fix

```jsx
// ❌ MUI v5 — broken in v6
<TextField InputProps={{ readOnly: true }} />

// ✅ MUI v6
<TextField slotProps={{ input: { readOnly: true } }} />
```

This applies to all `InputProps` usages, including `startAdornment`, `endAdornment`, etc:

```jsx
// ❌
<TextField InputProps={{ startAdornment: <SearchIcon /> }} />

// ✅
<TextField slotProps={{ input: { startAdornment: <SearchIcon /> } }} />
```
