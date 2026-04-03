import os

os.makedirs('static', exist_ok=True)

# Minimal valid ICO file (16x16 orange icon)
header = bytes([0, 0, 1, 0, 1, 0, 16, 16, 0, 0, 1, 0, 32, 0, 40, 1, 0, 0, 22, 0, 0, 0])
bmp_header = bytes(40)
pixels = bytes([255, 128, 0, 255]) * 256
and_mask = bytes(64)

ico_data = header + bmp_header + pixels + and_mask

with open('static/favicon.ico', 'wb') as f:
    f.write(ico_data)

print('Created static/favicon.ico')