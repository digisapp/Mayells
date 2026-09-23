# Mayells voice concierge

A LiveKit Agents worker that answers the Mayells phone lines with an xAI realtime voice. It takes appraisal requests (which become prospects in the admin), emails the caller a photo upload link, transfers callers to a specialist during business hours, and logs every call with a transcript and summary at `/admin/calls`.

## Environment

| Variable | Required | Notes |
| --- | --- | --- |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | yes | LiveKit project |
| `XAI_API_KEY` | yes | Realtime voice |
| `MAYELLS_API_URL` | yes | e.g. `https://mayells.com` |
| `VOICE_AGENT_SECRET` | yes | Same value as the app's `VOICE_AGENT_SECRET` on Vercel, 32+ characters (`openssl rand -hex 32`) |
| `TRANSFER_NUMBER` | no | E.164 number a specialist answers. Empty = callbacks only |
| `TRANSFER_HOURS` | no | Eastern time, default `Mon-Fri 09:00-18:00` |
| `MAX_CALL_MINUTES` | no | Default 15 |

## Phone numbers and city lines

`dispatch-rule.json` mirrors the live rule `SDR_DDtuEmLMgvE4` in the Mayells LiveKit project: every call to +1 561 987 7200 (the number shown on every site) goes to this agent in its own `mayells-*` room. Apply edits with `lk sip dispatch update --project mayells --id SDR_DDtuEmLMgvE4 dispatch-rule.json`. The agent reads the number that was dialled (`sip.trunkPhoneNumber`) and asks the app which city it belongs to. To give a city microsite its own line:

1. Buy or port the number in LiveKit and add it to the inbound trunk the dispatch rule covers.
2. Set `phone: { display, e164 }` on that city in `src/lib/microsites/config.ts`, and update its `metaDescription`, which spells the number out.

The city page then shows its own number, the agent greets callers as that city's office, and the calls and leads are attributed to the city.

## Deploy to LiveKit Cloud

Secrets live in `.env.production` next to this file (gitignored). Then:

```bash
lk agent create --project mayells --secrets-file .env.production .   # first time
lk agent deploy --project mayells --secrets-file .env.production .   # updates
```

## Run locally

```bash
pip install -r requirements.txt
python agent.py dev      # local, connects to LiveKit
python agent.py start    # production (the Dockerfile runs this)
```

## Compliance

- The greeting says the caller is speaking to an AI assistant and that the call is recorded and transcribed. Florida requires every party's consent to record, so the notice must come first. Keep it if you change the greeting.
- This agent answers inbound calls only. Outbound AI calls (for example, calling a form lead back) need the person's prior express consent under the TCPA. Add a consent checkbox to the form before building that.
