import re
import sys

log_file = sys.argv[1] if len(sys.argv) > 1 else "logs/v2/1_v2.log"

with open(log_file) as f:
    content = f.read()

backend_fps = re.findall(r'\[BACKEND-FPS\] ([\d.]+) fps', content)
video_fps   = re.findall(r'\[VIDEO-FPS\] ([\d.]+) fps', content)
bandwidth   = re.findall(r'\[BANDWIDTH\] ([\d.]+) Mbps', content)
latency     = re.findall(r'input → photon\s*:\s*([\d.]+) ms', content)

print("Backend FPS:")
print(" ".join(backend_fps))
print("\nClient Video FPS:")
print(" ".join(video_fps))
print("\nTotal Bandwidth (Mbps):")
print(" ".join(bandwidth))
print("\nInput → Photon Latency (ms):")
print(" ".join(latency))