#!/usr/bin/env bash
set -euo pipefail

# Ensure running as root
if [ "$EUID" -ne 0 ]; then
  echo "Error: This script must be run with sudo: sudo ./scripts/apply-bluetooth-freeze-fix.sh"
  exit 1
fi

echo "=========================================================="
echo "Applying Linux Bluetooth Freeze & AVRCP Lockup Prevention"
echo "=========================================================="

# 1. Disable USB autosuspend on btusb (prevents CSR 8510 clone firmware hang)
echo "[1/3] Configuring /etc/modprobe.d/bluetooth_dongle.conf..."
cat << 'EOF' > /etc/modprobe.d/bluetooth_dongle.conf
# Fix CSR 8510 clone (0a12:0001) USB autosuspend deadlock and enable clean HCI reset
options btusb enable_autosuspend=n reset=1
EOF
echo "      -> Done: btusb enable_autosuspend=n reset=1 applied."

# 2. Disable AVRCP input device registration in BlueZ (prevents Hyprland/libinput freeze)
echo "[2/3] Configuring /etc/bluetooth/main.conf to disable input plugin..."
if grep -q "Disable=input" /etc/bluetooth/main.conf; then
  echo "      -> Disable=input already present in main.conf."
else
  sed -i 's/^\[General\]/\[General\]\nDisable=input/' /etc/bluetooth/main.conf
  echo "      -> Done: Added Disable=input under [General]."
fi

# 3. Restart Bluetooth service
echo "[3/3] Restarting bluetooth.service..."
systemctl restart bluetooth
echo "      -> Bluetooth service restarted successfully."

echo "=========================================================="
echo "✓ All anti-freeze configurations applied successfully!"
echo "You can now safely connect Melobuds ANC without UI lockups."
echo "=========================================================="
