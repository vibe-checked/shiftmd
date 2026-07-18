# ShiftMD — App Store screenshot config. Run: python3 compose.py
APP_NAME    = "ShiftMD"
TAGLINE     = "Physician call schedules, solved."
TITLE_SIZE  = 110
ICON        = "../assets/icon.png"

RAW_DIR     = "raw"
OUT_DIR     = "../app-store-screenshots"

# Brand — sampled from the icon's blue gradient; green checks echo the icon badge.
BG_STOPS      = [(86, 146, 250), (37, 99, 235), (18, 52, 140)]
ACCENT        = (34, 197, 94)            # green checkmarks, pop on blue
HEADLINE_BOLD = None                     # white bold keywords
SUBTITLE      = (214, 224, 245)
WATERMARK     = (255, 255, 255)

# Hero (screens 1+2) — the month schedule.
HERO_SHOT = "schedule.png"
HERO_SW   = 1125
HERO_TILT = -20
HERO_PX   = 1050
HERO_SPILL = 120                        # spill hero phone across 02->03 (continuous device)
BULLETS = [
    "Auto-builds the whole month",
    "Never breaks a rule",
    "Honors every vacation",
    "Free forever — no catch",
]

PANEL_SW = 1150

# Feature panels (screens 3+):  (label, headline, raw, "low"|"high", subtitle)
PANELS = [
    ("balance",  "*Fair* across the team",   "balance.png",    "low",  "Hours and weekends balanced for everyone."),
    ("rules",    "Your rules, *enforced*",   "rules.png",      "low",  "Hours, weekends, consecutive days, coverage — never broken."),
    ("swap",     "Swap shifts in *seconds*", "swap.png",       "high", "Someone out? Reassign their shift in two taps."),
    ("timeoff",  "Vacations, *handled*",     "timeoff.png",    "low",  "Add time off by hand, or pull it from a calendar."),
    ("calsync",  "Sync *Google Calendar*",   "calsync.png",    "low",  "Import each physician's time off from their iCal feed."),
    ("free",     "*Free* forever, no catch", "physicians.png", "high", "No ads · no in-app purchases · no paywall."),
]
