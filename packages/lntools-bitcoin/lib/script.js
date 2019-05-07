// import OPS from 'bitcoin-ops';

// /**
//   Compiles the array of chunks into a valid script

//   @remarks

//   Heavily influenced by bitcoinjs-lib:
//   https://github.com/bitcoinjs/bitcoinjs-lib/blob/master/src/script.js#L35

//  */
// export function compileScript(chunks: Array<any>) {
//   function asMinimalOP(buffer) {
//     if (buffer.length === 0) return OPS.OP_0;
//     if (buffer.length !== 1) return;
//     if (buffer[0] >= 1 && buffer[0] <= 16) return OPS.OP_RESERVED + buffer[0];
//     if (buffer[0] === 0x81) return OPS.OP_1NEGATE;
//   }

//   let bufferSize = chunks.reduce((accum, chunk) => {
//     // data chunk
//     if (Buffer.isBuffer(chunk)) {
//       // adhere to BIP62.3, minimal push policy
//       if (chunk.length === 1 && asMinimalOP(chunk) !== undefined) {
//         return accum + 1;
//       }
//       return accum + pushdata.encodingLength(chunk.length) + chunk.length;
//     }
//     // opcode
//     return accum + 1;
//   }, 0.0);

//   let buffer = Buffer.alloc(bufferSize);
//   let offset = 0;

//   chunks.forEach(chunk => {
//     // data chunk
//     if (Buffer.isBuffer(chunk)) {
//       // adhere to BIP62.3, minimal push policy
//       const opcode = asMinimalOP(chunk);
//       if (opcode !== undefined) {
//         buffer.writeUInt8(opcode, offset);
//         offset += 1;
//         return;
//       }

//       offset += pushdata.encode(buffer, chunk.length, offset);
//       chunk.copy(buffer, offset);
//       offset += chunk.length;

//       // opcode
//     } else {
//       buffer.writeUInt8(chunk, offset);
//       offset += 1;
//     }
//   });
//   if (offset !== buffer.length) throw new Error('Could not decode chunks');
//   return buffer;
// }
