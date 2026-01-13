# Yuki Meds 🐕

WhatsApp medication reminder system for Yuki's post-surgery care (corneal laceration repair).

## Features

- **Individual reminders** - One WhatsApp message per medication
- **Staggered eye drops** - 6-minute intervals for same-eye drops (absorption time)
- **Confirmation tracking** - Reply "done" to confirm each medication
- **Re-reminders** - Unconfirmed meds trigger reminders every 30 minutes
- **Multi-person support** - Anyone connected to the WhatsApp sandbox can confirm

## Schedule

| Time | Slot | Medications |
|------|------|-------------|
| 8:30 AM | Morning | All meds |
| 2:00 PM | Midday | 4x daily eye drops only |
| 7:00 PM | Evening | All meds |
| 12:00 AM | Night | 4x daily eye drops only |

### Staggered Timing Example (Morning)

```
8:30 AM - Ofloxacin 0.3% (LEFT eye)
8:36 AM - Homologous plasma (LEFT eye)
8:42 AM - Amniotic eye drops (LEFT eye)
8:48 AM - Atropine 1% (LEFT eye)
8:54 AM - Prednisolone acetate 1% (RIGHT eye)
9:00 AM - Tacrolimus + Cyclosporine (RIGHT eye)
8:30 AM - Amoxicillin/Clavulanate (ORAL)
```

## Medications

### LEFT Eye (Post-Surgery)
- **Ofloxacin 0.3%** - 1 drop 4x daily
- **Homologous plasma** - 1 drop 4x daily (refrigerated)
- **Amniotic eye drops** - 1 drop 2x daily (refrigerated)
- **Atropine 1%** - Tapering: Day 1 (3x) → Day 2 (2x) → Day 3+ (1x)

### RIGHT Eye (Chronic)
- **Prednisolone acetate 1%** - 1 drop 2x daily
- **Tacrolimus 0.03% + Cyclosporine 2%** - 1 drop 2x daily (lifelong)

### Oral
- **Prednisolone 5mg** - ½ tablet 1x daily (starts Wednesday)
- **Amoxicillin/Clavulanate** - 1 mL every 12h with food (starts Day 2)
- **Gabapentin 50mg** - As needed for pain

## Local Development

```bash
# Install dependencies
bun install

# Preview schedule
bun src/check-schedule.js today
bun src/check-schedule.js day 3

# Test staggered timing
bun src/test-stagger.js

# Send test WhatsApp
bun src/test-sms.js ping

# Send individual reminders for a slot
bun src/test-sms.js morning

# Check pending confirmations
bun src/test-sms.js pending

# Confirm latest pending
bun src/test-sms.js confirm
```

## Environment Variables

```bash
# Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_TO_NUMBER=+1xxxxxxxxxx

# Vercel KV (for confirmation tracking)
KV_REST_API_URL=https://xxxx.kv.vercel-storage.com
KV_REST_API_TOKEN=xxxx
```

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│  cron-job.org   │────▶│  Vercel API  │────▶│   Twilio    │
│  (scheduler)    │     │  /api/cron   │     │  WhatsApp   │
└─────────────────┘     └──────────────┘     └─────────────┘
                               │                    │
                               ▼                    │
                        ┌──────────────┐            │
                        │  Vercel KV   │            │
                        │  (pending)   │            │
                        └──────────────┘            │
                               ▲                    │
                               │                    ▼
                        ┌──────────────┐     ┌─────────────┐
                        │  /api/webhook│◀────│   Reply     │
                        │  (confirms)  │     │   "done"    │
                        └──────────────┘     └─────────────┘
```

## Confirmation Keywords

Reply with any of these to confirm a medication:
- done, yes, good, ack, completed, complete
- ok, okay, yep, yup, confirmed, taken
- gave, given, finished, did, y
- 👍, ✅, ✓, check

## Deployment

### Vercel

```bash
vercel --prod

# Add environment variables
vercel env add TWILIO_ACCOUNT_SID
vercel env add TWILIO_AUTH_TOKEN
vercel env add TWILIO_TO_NUMBER
```

### Vercel KV Setup

1. Go to Vercel Dashboard → Storage → Create KV Database
2. Copy the environment variables to your project
3. Redeploy

### Twilio Webhook

1. Go to Twilio Console → Messaging → WhatsApp Sandbox
2. Set webhook URL: `https://your-app.vercel.app/api/webhook`
3. Method: POST

### Cron Jobs (cron-job.org)

| Job | Time | Purpose |
|-----|------|---------|
| Yuki Morning Meds | 8:30 AM | Send morning reminders |
| Yuki Midday Meds | 2:00 PM | Send midday reminders |
| Yuki Evening Meds | 7:00 PM | Send evening reminders |
| Yuki Night Meds | 12:00 AM | Send night reminders |
| Yuki Re-reminder | Every 30 min | Re-remind unconfirmed |

## Files

```
yuki/
├── api/
│   ├── cron.js          # Main cron endpoint
│   └── webhook.js       # Twilio webhook for confirmations
├── src/
│   ├── config/
│   │   └── medications.js   # Medication definitions
│   ├── lib/
│   │   ├── scheduler.js     # Schedule & staggering logic
│   │   ├── storage.js       # Vercel KV pending storage
│   │   └── twilio.js        # WhatsApp sending
│   ├── check-schedule.js    # CLI schedule viewer
│   ├── test-sms.js          # CLI testing tool
│   └── test-stagger.js      # Stagger timing test
├── .env.example
├── package.json
├── vercel.json
└── README.md
```

## License

Personal project for Yuki's care 🐾
