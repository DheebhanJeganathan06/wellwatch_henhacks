"""
db.py
Shared Snowflake connection logic for WellWatch.
Provides a connection factory, a context manager, and common query helpers.
"""

import snowflake.connector
from contextlib import contextmanager
from config import (
    SNOWFLAKE_ACCOUNT,
    SNOWFLAKE_USER,
    SNOWFLAKE_PASSWORD,
    SNOWFLAKE_DATABASE,
    SNOWFLAKE_SCHEMA,
    SNOWFLAKE_WAREHOUSE,
)


# Creates a raw Snowflake connection. Use this when you need to manage
# the connection lifecycle yourself, like in the MQTT subscriber where
# the connection stays open for the duration of the process.
# Always call conn.close() when you're done.
def get_connection():
    return snowflake.connector.connect(
        account=SNOWFLAKE_ACCOUNT,
        user=SNOWFLAKE_USER,
        password=SNOWFLAKE_PASSWORD,
        database=SNOWFLAKE_DATABASE,
        schema=SNOWFLAKE_SCHEMA,
        warehouse=SNOWFLAKE_WAREHOUSE,
    )


# Context manager that gives you a cursor and automatically handles
# commit on success, rollback on error, and cleanup of both the cursor
# and connection when the block exits. Used internally by the helpers
# below, but you can also use it directly in endpoints:
#
#   with get_cursor() as cur:
#       cur.execute("SELECT * FROM WELLS WHERE STATE = %s", ["PA"])
#       rows = cur.fetchall()
@contextmanager
def get_cursor():
    conn = get_connection()
    cur = conn.cursor()
    try:
        yield cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# Runs a SELECT and returns all rows as a list of tuples.
# Use this when you just need raw values without column names,
# like pulling a flat list of API_NUMBERs for the simulator:
#
#   rows = fetch_all("SELECT API_NUMBER FROM WELLS")
#   api_numbers = [row[0] for row in rows]
def fetch_all(query, params=None):
    with get_cursor() as cur:
        cur.execute(query, params or [])
        return cur.fetchall()


# Runs a SELECT and returns rows as a list of dictionaries with
# column names as keys, e.g. [{"API_NUMBER": "123", "LAT": 40.5}, ...].
# This is ideal for API responses since FastAPI can serialize dicts
# directly to JSON without manual field mapping. Used by endpoints
# like /wells and /alerts.
def fetch_dicts(query, params=None):
    conn = get_connection()
    cur = conn.cursor(snowflake.connector.DictCursor)
    try:
        cur.execute(query, params or [])
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


# Runs a single INSERT / UPDATE / DELETE and commits. Returns the
# number of rows affected. Use this for one-off writes like inserting
# a single triage result from the /triage endpoint:
#
#   execute("INSERT INTO AI_TRIAGE_RESULTS (API_NUMBER, ...) VALUES (%s, ...)", [api, ...])
def execute(query, params=None):
    with get_cursor() as cur:
        cur.execute(query, params or [])
        return cur.rowcount


# Batch insert/update using executemany. Sends all rows in a single
# round trip instead of one INSERT per row. This is what the MQTT
# subscriber uses to flush its buffer of sensor readings into
# SENSOR_READINGS efficiently:
#
#   execute_many(
#       "INSERT INTO SENSOR_READINGS (API_NUMBER, TS, CH4_PPM) VALUES (%s, %s, %s)",
#       [("1234", "2026-02-28 12:00:00", 45.2), ...]
#   )
def execute_many(query, param_list):
    with get_cursor() as cur:
        cur.executemany(query, param_list)
        return cur.rowcount