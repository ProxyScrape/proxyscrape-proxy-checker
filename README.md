<p align="center">
    <img width="255px" src="https://cdn.proxyscrape.com/img/logo/dark_text_logo.png">
    
   </br>
   </br>
</p>


![](https://cdn.proxyscrape.com/img/proxy-checker/proxy-results.png)

Full description & Documentation for [Proxy Checker](https://proxyscrape.com/proxy-checker)

## Release channels

| Channel | Branch | Version format | Example | Stability |
|---------|--------|----------------|---------|-----------|
| **Stable** | `master` | `MAJOR.MINOR.PATCH` | `1.2.1` | Production-ready |
| **Canary** | `canary` | `MAJOR.MINOR.PATCH-canary` | `2.0.0-canary` | Early access, may break |

**Stable** releases target everyday users. They are tagged `vMAJOR.MINOR.PATCH` (e.g. `v1.2.1`) and published as standard GitHub releases.

**Canary** releases give early access to new features (currently the Go-powered backend with packet capture). They are tagged `vMAJOR.MINOR.PATCH-canary` (e.g. `v2.0.0-canary`) and published as GitHub **pre-releases**. The `-canary` suffix is fixed — there is no iteration number appended. When the next set of features lands, only the base numbers increment (e.g. `v2.1.0-canary`).

When canary stabilises it graduates to a new stable version on `master` (e.g. `v2.0.0`).

## Releasing

### Stable (Windows)
```bash
git tag v1.2.1 && git push origin v1.2.1
```
GitHub Actions builds and publishes the Windows installer automatically.

### Canary (Windows)
```bash
git tag v2.0.0-canary && git push origin v2.0.0-canary
```
GitHub Actions builds and publishes as a Windows pre-release automatically. The in-app canary banner picks this up and offers the update to users.

#### ProxyScrape
[Premium](https://proxyscrape.com/premium) - ProxyScrape premium  
[Free Proxy List](https://proxyscrape.com/free-proxy-list) - Free proxy list updated every 5 minutes  
