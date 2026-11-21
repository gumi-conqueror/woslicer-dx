// Rename subset families without changing outlines, hinting or layout tables.
// Plex is a Reserved Font Name. Copyright and license records remain intact.
export function renameFont(input) {
  const count = input.readUInt16BE(4);
  const tables = [];
  for (let index = 0; index < count; index++) {
    const entry = 12 + index * 16;
    const tag = input.toString('ascii', entry, entry + 4);
    const start = input.readUInt32BE(entry + 8);
    let data = Buffer.from(input.subarray(start, start + input.readUInt32BE(entry + 12)));
    if (tag === 'name') {
      if (data.readUInt16BE(0) !== 0) throw new Error('Expected a format 0 font name table');
      const records = data.readUInt16BE(2);
      const storage = data.readUInt16BE(4);
      const header = Buffer.from(data.subarray(0, 6 + records * 12));
      header.writeUInt16BE(header.length, 4);
      const strings = [];
      let offset = 0;
      for (let record = 0; record < records; record++) {
        const position = 6 + record * 12;
        const platform = data.readUInt16BE(position);
        const nameId = data.readUInt16BE(position + 6);
        const length = data.readUInt16BE(position + 8);
        const stringOffset = storage + data.readUInt16BE(position + 10);
        let bytes = Buffer.from(data.subarray(stringOffset, stringOffset + length));
        if ([1, 3, 4, 6, 16, 18, 21, 25].includes(nameId)) {
          const unicode = platform === 0 || platform === 3;
          const encoding = unicode ? 'utf16le' : 'latin1';
          if (unicode) bytes.swap16();
          const renamed = bytes
            .toString(encoding)
            .replaceAll('IBM Plex', 'WOS UI')
            .replaceAll('IBMPlex', 'WosUI');
          bytes = Buffer.from(renamed, encoding);
          if (unicode) bytes.swap16();
        }
        header.writeUInt16BE(bytes.length, position + 8);
        header.writeUInt16BE(offset, position + 10);
        strings.push(bytes);
        offset += bytes.length;
      }
      data = Buffer.concat([header, ...strings]);
    }
    if (tag === 'head') data.writeUInt32BE(0, 8);
    tables.push({ tag, data });
  }
  let offset = 12 + count * 16;
  const output = Buffer.alloc(
    offset + tables.reduce((size, { data }) => size + Math.ceil(data.length / 4) * 4, 0),
  );
  input.copy(output, 0, 0, 12);
  let head = 0;
  for (const [index, { tag, data }] of tables.entries()) {
    const entry = 12 + index * 16;
    output.write(tag, entry, 'ascii');
    output.writeUInt32BE(offset, entry + 8);
    output.writeUInt32BE(data.length, entry + 12);
    data.copy(output, offset);
    const end = offset + Math.ceil(data.length / 4) * 4;
    output.writeUInt32BE(checksum(output.subarray(offset, end)), entry + 4);
    if (tag === 'head') head = offset;
    offset = end;
  }
  if (!head) throw new Error('Missing font head table');
  output.writeUInt32BE((0xb1b0afba - checksum(output)) >>> 0, head + 8);
  return output;
}

function checksum(bytes) {
  let sum = 0;
  for (let offset = 0; offset < bytes.length; offset += 4) {
    sum = (sum + bytes.readUInt32BE(offset)) >>> 0;
  }
  return sum;
}
