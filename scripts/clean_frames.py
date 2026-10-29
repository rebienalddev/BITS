import re
import os

with open('index.html', 'r') as f:
    content = f.read()

def replacer(match):
    full_match = match.group(0)
    src_match = re.search(r'src="([^"]+)"', full_match)
    if src_match:
        filename = src_match.group(1)
        if not os.path.exists(filename):
            return ''
    return full_match

new_content = re.sub(r'<img[^>]+>', replacer, content)

with open('index.html', 'w') as f:
    f.write(new_content)
