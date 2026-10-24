---
name: Paid image generation
description: Retry, idempotency and provider-catalog constraints for paid styling simulations
---

Treat each accepted styling response as one image-generation request. Polling, reopening a chat, or repeating the create action for that response must reuse its existing job/output. Provider-side automatic retries are intentionally disabled; retrying a failed image is an explicit user action.

**Why:** A provider may finish and bill an image before its response is lost. Automatic retries can charge again and produce a different simulation, even when the original request appeared to time out.

**How to apply:** Preserve this behavior when changing chat controls, provider SDK configuration, or job recovery. Interrupted in-flight work has an ambiguous outcome; persisted app-level jobs do not by themselves guarantee exactly-once provider billing across a process crash.

## Verify image support separately from chat

Check current official Replit documentation and verify the actual image-edit endpoint rather than assuming a model listed in an integration guide is still accepted.

**Why:** On 2026-10-24, managed chat worked while the image endpoint rejected an alias still listed in the integration guide. Model-catalog discovery returned HTTP 405. Official documentation identified a supported replacement that successfully produced an image.

**How to apply:** For a model-name rejection, do not immediately reprovision working credentials or cycle through guessed aliases. Consult current documentation, then make one controlled image request; successful chat calls do not verify image capability.
