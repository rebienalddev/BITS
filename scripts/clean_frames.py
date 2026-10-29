import re
import os

with open('index.html', 'r') as f:
    content = f.read()

# We want to replace any <img ... src="XYZ.png" ...> if XYZ.png doesn't exist.
def replacer(match):
    full_match = match.group(0)
    src_match = re.search(r'src="([^"]+)"', full_match)
    if src_match:
        filename = src_match.group(1)
        if not os.path.exists(filename):
            return '' # Remove the line if file doesn't exist
    return full_match

# Find all <img> tags and apply replacer
new_content = re.sub(r'<img[^>]+>', replacer, content)

with open('index.html', 'w') as f:
    f.write(new_content)
