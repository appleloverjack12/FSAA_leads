# Formula Student Alpe Adria · Partnership Intelligence

Automated partnership lead digest for fs-alpeadria.com. Scans European business news every 3 days, identifies companies that could become either infrastructure partners (tents, toilets, fuel, generators etc.) or brand sponsors (defense, automotive, tech companies wanting exposure to engineering students).

## Setup

Same as kajgod-leads. Push to GitHub, add 4 secrets:

| Secret | Value |
|---|---|
| `ANTHROPIC_API_KEY` | From console.anthropic.com |
| `GMAIL_USER` | Gmail to send from |
| `GMAIL_APP_PASSWORD` | Gmail App Password |
| `EMAIL_TO` | Where to receive the digest |

Then: Actions → FSAA Partnership Intelligence → Run workflow.

## What it looks for

**Infrastructure partners** — tent/marquee suppliers, portable toilet companies, fencing, fuel, generators, containers, catering

**Brand sponsors** — defense & aerospace (Rheinmetall, KNDS, Airbus etc.), automotive OEMs and suppliers, robotics, engineering software, semiconductors, energy — any STEM company that recently got funding and wants brand visibility with engineering students

© Formula Student Alpe Adria
