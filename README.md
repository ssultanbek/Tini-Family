# Tini Family (ShellHacks 2026)

A safety crew for AI coding agents: your agent gets the keys to the room, not the house.

| Folder | Owner | What |
|---|---|---|
| `shared/` | Sultan only | Event contract (`events.ts`) and state reducer. The one file both sides import. |
| `mock/` | Sultan only | Fake engine on port 4000 + recordings in `mock/recordings/`. |
| `game/` | Teammate only | The whole front end. Rules in `game/CLAUDE.md`. |
| `engine/` | Sultan only | Real engine: Claude Agent SDK runner, Tini, Tina, events, replay. |

## Quick start
```bash
cd mock && npm install && npm run mock          # fake engine on :4000
cd mock && npm test                             # auto-clicks the whole story (pass = PASS)
cd engine && npm install && npm test            # fence guard unit tests
cd engine && export ANTHROPIC_API_KEY=... && npm run spike   # hook spike (Mac only)
```

## Rules
Engine decides what and why; the game decides how it looks. No pixel positions in events.
The game only sends clicks. New behavior = a new event in `shared/events.ts`, added by Sultan.
Pull before work, push when something works, never edit another person's folder.
