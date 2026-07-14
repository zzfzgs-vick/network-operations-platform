# Executive Dashboard

Status: Decided for MVP

## Purpose

The Executive Dashboard provides a leadership-level view of network condition and operational impact while the operator console retains device-level diagnosis and change workflows.

It is a complete MVP capability. Only unattended kiosk authentication is excluded.

## User and access

Executive Viewer signs in normally and receives read-only access through `dashboard.executive.read`. Backend authorization enforces the boundary; hidden frontend controls are not security.

Executive Viewer cannot manage users, Roles, assets, lines, topology, credentials, alert rules, backup, restore, or system configuration and cannot read raw authentication or audit detail, device commands, SNMP secrets, database credentials, or raw sensitive configuration.

## Required dashboard content

- Overall network health
- Core-device online rate
- Core-link availability
- Current major alerts
- Number of affected sites and businesses
- Aggregate topology for regions, sites, and core links
- Latest 24-hour trends
- Bandwidth-utilization ranking
- Unstable-link ranking
- Current incidents and handling status

Health reporting uses the decided authoritative Health Status, nullable Health Score, Operational Mode, Data Quality, Coverage Ratio, and Health Reason model. Concrete object-policy thresholds, major-alert threshold, SLA calculation, and unstable-link ranking remain separate configuration and acceptance decisions rather than being invented here.

## Health presentation

The dashboard reports all of these together:

- Confirmed Healthy Ratio
- `DEGRADED`, `CRITICAL`, and `UNKNOWN` counts
- Health Data Coverage
- Maintenance count

Confirmed Healthy Ratio uses healthy object weight over every `ACTIVE` participating object weight; unknown objects remain in the denominator. Health Data Coverage reports the reliable-state weight over the same population. A high healthy ratio cannot hide low coverage.

Maintenance objects are reported separately and do not enter the ordinary active healthy count. Maintenance never changes the underlying Health Status: an object can be shown as critical and under maintenance at the same time.

Health Score supports ranking and trend but never determines the dashboard's authoritative state. `UNKNOWN` score is displayed as an em dash, not 0. Score details expose components, weights, deductions, coverage, policy version, and calculation time.

Aggregate topology uses green for `HEALTHY`, yellow or orange for `DEGRADED`, red for `CRITICAL`, and gray for `UNKNOWN`, with text or icons in addition to color. Operational Mode and Data Quality use separate badges, borders, or patterns so maintenance and stale data do not hide the underlying status.

## Presentation

- Automatic refresh of current state
- Fullscreen Mode
- Layout optimized for 1920×1080
- Basic adaptation for 4K displays
- Large-text and large-screen presentation
- Optional rotation among read-only views
- Prominent display of major alerts

Fullscreen Mode may hide navigation and editing entry points but does not change identity, Permissions, Session, or Cookie behavior.

## Executive Display Data

Default display may include site and device-group names, approved core-link business names, aggregate status and health, alert counts, business-impact summaries, availability, and trends.

Default display excludes SNMP usernames and secrets, management passwords, complete internal configuration, user and authentication information, precise vulnerability detail, unapproved sensitive business names, raw OIDs unrelated to leadership decisions, and complete management-address lists.

The backend controls the allowlisted response shape; the dashboard does not consume administrator device-detail responses and filter them only in the browser.

## API boundary

The product uses dedicated read-only aggregation interfaces conceptually equivalent to:

```text
GET /api/executive/dashboard/summary
GET /api/executive/dashboard/topology
GET /api/executive/dashboard/incidents
GET /api/executive/dashboard/trends
```

Every endpoint requires `dashboard.executive.read`, returns only required aggregate data, excludes credentials and management configuration, and uses the ordinary server-side Session. Health responses include status, nullable score, Operational Mode, Data Quality, Coverage Ratio, reasons, policy version, calculation time, and validity where applicable rather than returning one integer. SSE may deliver incremental status; its heartbeat does not extend Session idle lifetime.

## Session behavior

Executive Dashboard uses the ordinary Authenticated Session baseline:

- 30-minute idle timeout
- 12-hour absolute lifetime
- No remember-me behavior
- Automatic refresh and SSE heartbeat are not User Activity
- Manual login is required after expiry

On expiry the page:

1. Stops protected requests.
2. Closes SSE or another long connection.
3. Stops presenting retained state as live.
4. Shows that the Session expired, the last successful update time, and a request to sign in again.
5. May retain cached values only beneath an explicit stale-data overlay.
6. Does not submit login repeatedly or retry indefinitely.

## MVP non-goals

- Kiosk mode or Display Session
- Permanent, automatic, or cross-day login
- Browser-start auto-authentication
- Long-lived fixed or URL Tokens
- Public passwordless dashboard
- IP-only authentication bypass
- Device-certificate or terminal-bound authentication
- Dedicated display-account rotation
- Automatic recovery after display power or browser restart
- Background refresh that extends Session idle lifetime
- A single score that hides Health Status, unknown population, coverage, or maintenance
- Counting `UNKNOWN` or maintenance objects as confirmed healthy

## Future Unattended Display trigger

A separate ADR and specification are required when a fixed display terminal, 24×7 operation, no routine human login, controlled physical location, approved data classification, known network placement, credential and revocation ownership, restart recovery, and information-security approval are all sufficiently defined.

That design may evaluate a Display Principal, Display Device, restricted Display Session, device identity, source-network controls, credential rotation, remote revocation, physical security, and periodic human authorization. It cannot reuse an administrator identity, grant edit access, expose credentials, depend only on source IP, or make ordinary Executive Viewer Sessions permanent.
