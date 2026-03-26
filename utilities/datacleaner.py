import re                    
import sys
                                                                                                                                                                                                                                                                                                                                                                                                                    
input_file  = sys.argv[1]
output_file = sys.argv[2]                                                                                                                                                                                                                                                                                                                                                                                             
threshold   = float(sys.argv[3]) if len(sys.argv) > 3 else 50.0                                                                                                                                                                                                                                                                                                                                                     
                                                                                                                                                                                                                                                                                                                                                                                                                    
with open(input_file) as f:
    lines = f.readlines()

# Group lines into paragraphs — each ends after the "input → photon" line
paragraphs = []
current = []

for line in lines:
    current.append(line)
    if 'input → photon' in line:
        paragraphs.append(current)
        current = []

if current:  # any trailing lines not part of a full paragraph
    paragraphs.append(current)

# Filter out paragraphs where BANDWIDTH exceeds threshold
def get_bandwidth(paragraph):
    for line in paragraph:
        m = re.search(r'\[BANDWIDTH\] ([\d.]+) Mbps', line)
        if m:
            return float(m.group(1))
    return 0.0

filtered = [p for p in paragraphs if get_bandwidth(p) <= threshold]

with open(output_file, 'w') as f:
    for paragraph in filtered:
        f.writelines(paragraph)

removed = len(paragraphs) - len(filtered)
print(f"Removed {removed} paragraphs with bandwidth > {threshold} Mbps")
print(f"Kept {len(filtered)} paragraphs")