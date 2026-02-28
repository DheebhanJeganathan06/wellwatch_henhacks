import paho.mqtt.client as mqtt
import json, time, random, os, uuid
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

# 10 pre-seeded high risk demo wells
HIGH_RISK_WELLS = [f"WELL_HR_{i}" for i in range(10)]
# 490 normal wells
ALL_WELLS = HIGH_RISK_WELLS + [f"WELL_{i}" for i in range(490)]

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("Connected to HiveMQ!")
    else:
        print(f"Connection failed with code {rc}")

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1)
client.username_pw_set(os.getenv("MQTT_USERNAME"), os.getenv("MQTT_PASSWORD"))
client.tls_set()
client.on_connect = on_connect
client.connect(os.getenv("MQTT_BROKER"), int(os.getenv("MQTT_PORT")))
client.loop_start()

print("Simulator starting, publishing every 60 seconds...")

while True:
    for well_id in ALL_WELLS:
        high_risk = well_id in HIGH_RISK_WELLS
        payload = {
            "reading_id": str(uuid.uuid4()),
            "well_id": well_id,
            "ts": datetime.now(timezone.utc).isoformat(),
            "ch4_ppm": round(random.uniform(300, 800) if high_risk else random.uniform(1.5, 5), 2),
            "pressure_psi": round(random.uniform(30, 70) if high_risk else random.uniform(0, 10), 2),
            "temp_delta_c": round(random.uniform(3, 8) if high_risk else random.uniform(0, 1), 2),
            "subsidence_mm": round(random.uniform(2, 6) if high_risk else random.uniform(0, 0.5), 2),
            "signal_strength": round(random.uniform(60, 100), 2),
            "battery_pct": round(random.uniform(70, 100), 2)
        }
        topic = os.getenv("MQTT_TOPIC", "wells/sensors")
        client.publish(f"{topic}/{well_id}", json.dumps(payload))

    print(f"Published {len(ALL_WELLS)} well readings at {datetime.now().strftime('%H:%M:%S')}")
    time.sleep(60)