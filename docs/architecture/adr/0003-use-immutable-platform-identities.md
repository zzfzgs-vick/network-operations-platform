---
status: accepted
date: 2026-07-13
---

# Use immutable platform identities for devices and interfaces

The platform assigns immutable identities to Managed Devices, Device Instances, Managed Interfaces, and Topology Relations. IP addresses, names, serial numbers, MAC addresses, and `ifIndex` values cannot individually be formal identity because they may change, repeat, be absent, contain defaults, be scoped to one observation context, or describe hardware rather than the logical managed role.

A Managed Device represents the logical network position or responsibility; one or more Device Instances represent the physical or virtual hardware occupying that role over time or concurrently in a stack. Confirmed hardware replacement retains `managedDeviceId`, retires the old `deviceInstanceId`, creates a new instance, and keeps instance-specific observations and metrics separated so serial numbers, uptime, and other hardware history are not blended.

Only unique and conflict-free strong Matching Evidence may associate automatically. Medium or weak evidence, multiple targets, or conflicting strong evidence creates a reviewable candidate, ambiguity, or conflict. Automatic decisions record the evidence, confidence, and rule version; low-confidence evidence never silently merges a device or interface.

Identity merges, splits, interface rebinds, and hardware replacements are explicit, audited, and reversible. A merge preserves the source ID and history through an Identity Redirect rather than physical deletion, allowing an incorrect merge to be undone without erasing who acted, when, why, or which evidence was used.
