import struct, zlib
path = "public/Icons/Classico/colazione.png"
with open('.git/index','rb') as f:
    data = f.read()
magic, version, num = struct.unpack('!4sLL', data[:12])
offset = 12
for _ in range(num):
    entry = data[offset:offset+62]
    ctime, mtime, dev, ino, mode, uid, gid, size = struct.unpack('!LLLLLLLL', entry[:32])
    sha = entry[32:52]
    flags = struct.unpack('!H', entry[52:54])[0]
    path_end = data.find(b'\x00', offset+62)
    path_bytes = data[offset+62:path_end]
    entry_len = ((path_end+1 + 8) + 7) & ~7
    actual_path = path_bytes.decode()
    if actual_path == path:
        sha_hex = sha.hex()
        break
    offset = entry_len
else:
    raise SystemExit('path not found')
obj_dir = '.git/objects/' + sha_hex[:2]
obj_path = obj_dir + '/' + sha_hex[2:]
with open(obj_path,'rb') as f:
    decompressed = zlib.decompress(f.read())
header, _, content = decompressed.partition(b'\x00')
with open(path,'wb') as out:
    out.write(content)
print('restored', sha_hex)
