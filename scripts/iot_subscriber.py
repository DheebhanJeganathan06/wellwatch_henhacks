import json
import time
import threading
import sys
import os
import ssl
import paho.mqtt.client as mqtt

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app"))

from config import MQTT_BROKER_HOST, MQTT_BROKER_PORT, MQTT_TOPIC_PREFIX, MQTT_USERNAME, MQTT_PASSWORD, BATCH_SIZE, BATCH_FLUSH_SEC
from db import execute_many

# ─────────────────────────────────────────────
# Global buffer
# ─────────────────────────────────────────────

buffer = []
buffer_lock = threading.Lock()
last_flush_time = time.time()

# ─────────────────────────────────────────────
# Convert MQTT payload → Snowflake row
# ─────────────────────────────────────────────

def payload_to_row(payload: dict):
    return (
        payload["api_number"],
        payload["ts"],
        payload.get("ch4_ppm"),
        payload.get("pressure_psi"),
        payload.get("temp_delta_c"),
        payload.get("subsidence_mm"),
        payload.get("signal_strength"),
        payload.get("battery_pct"),
        payload.get("is_dropout", False),
        payload.get("dropout_reason"),
        payload.get("data_quality_flag", "OK"),
    )

# ─────────────────────────────────────────────
# Flush buffer to Snowflake
# ─────────────────────────────────────────────

def flush():
    global buffer, last_flush_time

    with buffer_lock:
        if not buffer:
            return
        rows = buffer
        buffer = []

    print(f"Inserting batch of {len(rows)} readings...", flush=True)

    try:
        execute_many(
            """
            INSERT INTO SENSOR_READINGS (
                API_NUMBER, TS, CH4_PPM, PRESSURE_PSI, TEMP_DELTA_C,
                SUBSIDENCE_MM, SIGNAL_STRENGTH, BATTERY_PCT,
                IS_DROPOUT, DROPOUT_REASON, DATA_QUALITY_FLAG
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            rows,
        )
        last_flush_time = time.time()
        print(f"Batch inserted successfully.", flush=True)
    except Exception as e:
        print(f"ERROR inserting to Snowflake: {e}", flush=True)

# ─────────────────────────────────────────────
# Background flush timer
# ─────────────────────────────────────────────

def flush_loop():
    global last_flush_time
    while True:
        time.sleep(1)
        if time.time() - last_flush_time >= BATCH_FLUSH_SEC:
            flush()

# ─────────────────────────────────────────────
# MQTT callbacks
# ─────────────────────────────────────────────

def on_connect(client, userdata, flags, rc, properties=None):
    rc_val = rc.value if hasattr(rc, 'value') else rc
    if rc_val == 0:
        print(f"Connected!", flush=True)
        client.subscribe(f"{MQTT_TOPIC_PREFIX}/#")
        print(f"Subscribed to {MQTT_TOPIC_PREFIX}/#", flush=True)
    else:
        print(f"Connection failed: {rc}", flush=True)

def on_message(client, userdata, msg):
    global buffer

    try:
        payload = json.loads(msg.payload.decode())
        row = payload_to_row(payload)

        should_flush = False
        with buffer_lock:
            buffer.append(row)
            if len(buffer) >= BATCH_SIZE:
                should_flush = True

        if should_flush:
            print("Buffer full, flushing...", flush=True)
            flush()

    except Exception as e:
        print(f"Error processing message: {e}", flush=True)

# ─────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────

print(f"Connecting to {MQTT_BROKER_HOST}:{MQTT_BROKER_PORT}...", flush=True)

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
client.tls_set(ca_certs=None, certfile=None, keyfile=None, cert_reqs=ssl.CERT_REQUIRED, tls_version=ssl.PROTOCOL_TLS_CLIENT)

client.on_connect = on_connect
client.on_message = on_message

client.connect(MQTT_BROKER_HOST, MQTT_BROKER_PORT, keepalive=60)
client.loop_start()

print("Waiting for messages...", flush=True)

flush_thread = threading.Thread(target=flush_loop, daemon=True)
flush_thread.start()

while True:
    time.sleep(10)