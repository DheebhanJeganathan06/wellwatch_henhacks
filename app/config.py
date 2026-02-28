"""
config.py
Centralized configuration for WellWatch.
Reads from .env via python-dotenv. Import this module anywhere you need settings.
"""

import os
from dotenv import load_dotenv

load_dotenv()

# ── Snowflake ──
SNOWFLAKE_ACCOUNT = os.getenv("SNOWFLAKE_ACCOUNT")
SNOWFLAKE_USER = os.getenv("SNOWFLAKE_USER")
SNOWFLAKE_PASSWORD = os.getenv("SNOWFLAKE_PASSWORD")
SNOWFLAKE_DATABASE = os.getenv("SNOWFLAKE_DATABASE", "SNOWFLAKE_LEARNING_DB")
SNOWFLAKE_SCHEMA = os.getenv("SNOWFLAKE_SCHEMA", "PUBLIC")
SNOWFLAKE_WAREHOUSE = os.getenv("SNOWFLAKE_WAREHOUSE")

# ── MQTT ──
MQTT_BROKER_HOST = os.getenv("MQTT_BROKER_HOST", "localhost")
MQTT_BROKER_PORT = int(os.getenv("MQTT_BROKER_PORT", "1883"))
MQTT_TOPIC_PREFIX = "wellwatch/sensors"  # full topic: wellwatch/sensors/{api_number}

# ── Simulator settings ──
SIM_INTERVAL_SEC = float(os.getenv("SIM_INTERVAL_SEC", "5"))      # seconds between readings
SIM_WELL_LIMIT = int(os.getenv("SIM_WELL_LIMIT", "50"))           # max wells to simulate at once
SIM_DROPOUT_CHANCE = float(os.getenv("SIM_DROPOUT_CHANCE", "0.05"))  # 5% chance of a dropout

# ── Subscriber / batch insert settings ──
BATCH_SIZE = int(os.getenv("BATCH_SIZE", "50"))          # flush after N messages
BATCH_FLUSH_SEC = float(os.getenv("BATCH_FLUSH_SEC", "5"))  # or flush after N seconds

# ── Gemini ──
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# ── Mapbox ──
MAPBOX_TOKEN = os.getenv("MAPBOX_TOKEN")