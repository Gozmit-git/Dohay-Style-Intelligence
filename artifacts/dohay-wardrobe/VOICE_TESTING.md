# Browser voice testing

Run the deterministic automated suite with:

```sh
pnpm --filter @workspace/dohay-wardrobe test
```

The suite stubs `SpeechRecognition`/`webkitSpeechRecognition`, `speechSynthesis`,
and `SpeechSynthesisUtterance`. It checks state, callbacks, cancellation, and
rendered fallback messages without opening a real microphone or playing audible
audio. A passing test run does **not** verify browser permissions, speech service
availability, microphone capture quality, or the device's speaker/headphone
output.

Before a release that changes voice behavior, do a separate manual real-device
smoke check in a supported browser: allow microphone access and dictate a draft
without sending it; deny access and confirm typed chat still works; enable reply
reading and use Listen/Stop on a long reply; disable automatic reading while a
reply is pending; then change conversation, sign out/change account, navigate
away, and hide the tab to confirm voice stops. Record the browser/device used
and any limitation; do not treat this manual check as automated coverage.
