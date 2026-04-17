#!/bin/bash
# Start PocketBase backend for Debt Tracker
cd "$(dirname "$0")/pocketbase"
echo "Starting PocketBase at http://127.0.0.1:8090"
echo "Admin UI: http://127.0.0.1:8090/_/"
./pocketbase serve --http="127.0.0.1:8090"
