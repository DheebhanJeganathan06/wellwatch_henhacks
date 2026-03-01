"""
iot_simulator.py


Simulates methane IoT sensors for wells stored in Snowflake.
Publishes readings to MQTT (HiveMQ Cloud):


    wellwatch/sensors/{api_number}


Usage:
    cd wellwatch_henhacks
    venv\\Scripts\\activate
    python scripts/iot_simulator.py
"""


import json
import time
import random
import uuid
import sys
import os
import ssl
from datetime import datetime, timezone


import paho.mqtt.client as mqtt


# Add the app/ folder to the path so we can import db and config
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app"))


from config import (
    MQTT_BROKER_HOST,
    MQTT_BROKER_PORT,
    MQTT_TOPIC_PREFIX,
    MQTT_USERNAME,
    MQTT_PASSWORD,
    SIM_INTERVAL_SEC,
    SIM_WELL_LIMIT,
    SIM_DROPOUT_CHANCE,
)
from db import fetch_all




# ─────────────────────────────────────────────
# Load wells from Snowflake
# ─────────────────────────────────────────────


def load_wells():
    """
    Pull a list of wells from Snowflake and assign each one a
    baseline "personality" so the simulation feels realistic.
    Abandoned wells get a higher risk factor = more frequent spikes.
    """
    print("Loading wells from Snowflake...")


    rows = fetch_all(
        "SELECT API_NUMBER, WELL_STATUS FROM WELLS LIMIT %s",
        [SIM_WELL_LIMIT],
    )


    if not rows:
        print("ERROR: No wells found in Snowflake. Run load_wells.py first.")
        sys.exit(1)


    wells = {}
    for api_number, status in rows:
        # Abandoned/orphaned wells are more likely to leak
        is_risky = status and any(
            keyword in status.upper()
            for keyword in ["ABANDON", "ORPHAN", "INACTIVE"]
        )


        wells[api_number] = {
            "ch4_ppm": random.uniform(1.5, 3.0),       # ambient methane baseline
            "pressure_psi": random.uniform(1, 10),      # low starting pressure
            "temp_delta_c": random.uniform(0, 0.5),     # minimal temp anomaly
            "subsidence_mm": random.uniform(0, 0.2),    # minimal ground shift
            "battery_pct": random.uniform(90, 100),     # near-full battery
            "signal_strength": random.uniform(70, 95),  # decent signal
            "risk_factor": 3 if is_risky else 1,        # spike multiplier
        }


    print(f"Loaded {len(wells)} wells.")
    return wells




# ─────────────────────────────────────────────
# Update well state (random walk with drift)
# ─────────────────────────────────────────────


def update_state(state):
    """
    Advance the well's sensor state by one tick. Uses a random walk
    so values drift naturally rather than jumping around.
    """
    rf = state["risk_factor"]


    # Methane: slow drift with occasional spikes for risky wells
    state["ch4_ppm"] += random.uniform(-0.3, 0.4) * rf
    state["ch4_ppm"] = max(0.5, state["ch4_ppm"])


    # Rare methane spike (1% chance per tick, 3% for risky wells)
    if random.random() < 0.01 * rf:
        spike = random.uniform(50, 500) * rf
        state["ch4_ppm"] += spike


    # Pressure: slow drift
    state["pressure_psi"] += random.uniform(-0.5, 0.6) * rf
    state["pressure_psi"] = max(0, state["pressure_psi"])


    # Temperature anomaly: small drift
    state["temp_delta_c"] += random.uniform(-0.1, 0.15)
    state["temp_delta_c"] = max(0, state["temp_delta_c"])


    # Subsidence: very slow accumulation
    state["subsidence_mm"] += random.uniform(-0.01, 0.05)
    state["subsidence_mm"] = max(0, state["subsidence_mm"])


    # Battery: slow decay, never recharges
    state["battery_pct"] -= random.uniform(0.01, 0.05)
    state["battery_pct"] = max(0, state["battery_pct"])


    # Signal: drifts around
    state["signal_strength"] += random.uniform(-1, 1)
    state["signal_strength"] = max(40, min(100, state["signal_strength"]))




# ─────────────────────────────────────────────
# Generate MQTT payload
# ─────────────────────────────────────────────


def generate_payload(api_number, state):
    """
    Build a JSON-serializable dict representing one sensor reading.
    Occasionally simulates a dropout where sensor values are null.
    """
    is_dropout = random.random() < SIM_DROPOUT_CHANCE


    payload = {
        "reading_id": str(uuid.uuid4()),
        "api_number": api_number,
        "ts": datetime.now(timezone.utc).isoformat(),
        "signal_strength": round(state["signal_strength"], 2),
        "battery_pct": round(state["battery_pct"], 2),
        "is_dropout": is_dropout,
    }


    if is_dropout:
        # Dropout: sensor values are null, only health metrics survive
        payload.update({
            "ch4_ppm": None,
            "pressure_psi": None,
            "temp_delta_c": None,
            "subsidence_mm": None,
            "dropout_reason": random.choice([
                "SIGNAL_LOSS",
                "SENSOR_FAULT",
                "LOW_BATTERY",
                "INTERFERENCE",
            ]),
            "data_quality_flag": "BAD",
        })
    else:
        payload.update({
            "ch4_ppm": round(state["ch4_ppm"], 2),
            "pressure_psi": round(state["pressure_psi"], 2),
            "temp_delta_c": round(state["temp_delta_c"], 2),
            "subsidence_mm": round(state["subsidence_mm"], 2),
            "dropout_reason": None,
            "data_quality_flag": "OK",
        })


    return payload




# ─────────────────────────────────────────────
# MQTT client setup (HiveMQ Cloud)
# ─────────────────────────────────────────────


def create_client():
    """
    Create and connect an MQTT client to HiveMQ Cloud.
    HiveMQ Cloud requires:
      - TLS on port 8883
      - Username/password authentication
    """
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)


    # Authentication
    if MQTT_USERNAME and MQTT_PASSWORD:
        client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
    else:
        print("WARNING: MQTT_USERNAME or MQTT_PASSWORD not set in .env")


    # TLS — required for HiveMQ Cloud on port 8883.
    # Uses the system's default trusted CA certificates.
    client.tls_set(
        ca_certs=None,               # use system CA bundle
        certfile=None,               # no client cert needed
        keyfile=None,                # no client key needed
        cert_reqs=ssl.CERT_REQUIRED, # verify server certificate
        tls_version=ssl.PROTOCOL_TLS_CLIENT,
    )


    # Connection callbacks
    def on_connect(client, userdata, flags, rc, properties=None):
        if rc.value == 0:
            print(f"Connected to MQTT broker at {MQTT_BROKER_HOST}:{MQTT_BROKER_PORT}")
        else:
            print(f"MQTT connection failed: {rc}")


    def on_disconnect(client, userdata, flags, rc, properties=None):
        if rc != 0:
            print(f"Unexpected MQTT disconnect (rc={rc}). Attempting reconnect...")


    client.on_connect = on_connect
    client.on_disconnect = on_disconnect


    # Connect
    print(f"Connecting to {MQTT_BROKER_HOST}:{MQTT_BROKER_PORT}...")
    try:
        client.connect(MQTT_BROKER_HOST, MQTT_BROKER_PORT, keepalive=60)
    except Exception as e:
        print(f"ERROR: Could not connect to MQTT broker: {e}")
        print("\nTroubleshooting:")
        print(f"  1. Check MQTT_BROKER_HOST in .env (current: {MQTT_BROKER_HOST})")
        print(f"  2. Check MQTT_BROKER_PORT in .env (current: {MQTT_BROKER_PORT})")
        print("  3. HiveMQ Cloud uses port 8883 with TLS, not 1883")
        print("  4. Verify username/password in your HiveMQ Cloud dashboard")
        sys.exit(1)


    # Start background network loop (handles reconnects automatically)
    client.loop_start()


    # Give it a moment to complete the TLS handshake
    time.sleep(2)


    return client




# ─────────────────────────────────────────────
# Main loop
# ─────────────────────────────────────────────


def main():
    wells = load_wells()
    client = create_client()


    print(f"\nSimulator running — {len(wells)} wells, publishing every {SIM_INTERVAL_SEC}s")
    print(f"Topic pattern: {MQTT_TOPIC_PREFIX}/{{api_number}}")
    print("Press Ctrl+C to stop.\n")


    try:
        tick = 0
        while True:
            tick += 1
            spikes = 0


            for api_number, state in wells.items():
                old_ch4 = state["ch4_ppm"]
                update_state(state)


                # Track spikes for the log line
                if state["ch4_ppm"] - old_ch4 > 50:
                    spikes += 1


                payload = generate_payload(api_number, state)
                topic = f"{MQTT_TOPIC_PREFIX}/{api_number}"
                client.publish(topic, json.dumps(payload))


            timestamp = datetime.now().strftime("%H:%M:%S")
            spike_note = f" ({spikes} spikes!)" if spikes > 0 else ""
            print(f"[{timestamp}] Tick {tick}: published {len(wells)} readings{spike_note}")


            time.sleep(SIM_INTERVAL_SEC)


    except KeyboardInterrupt:
        print("\nStopping simulator...")
        client.loop_stop()
        client.disconnect()
        print("Disconnected. Goodbye.")




# ─────────────────────────────────────────────


if __name__ == "__main__":
    main()



