import { MockVM } from "@koinos/mock-vm";
import protoJs from "@koinos/proto-js";
import somap from "somap";

// System-call ids by name, for the cost probe below.
const SID = Object.fromEntries(Object.entries(protoJs.koinos.chain.system_call_id).map(([k, v]) => [v, k]));

// Runs the contract's tests inside a simulated Koinos chain (no network, no KOIN).
export default {
  entries: ["assembly/__tests__/**/*.spec.ts"],
  include: ["assembly/__tests__/**/*.include.ts"],
  disclude: [/node_modules/i],
  async instantiate(memory, createImports, instantiate, binary) {
    const mockVM = new MockVM();
    // MockVM 1.3.0 orders its database keys with `a > b` on Buffers, which UTF-8-decodes them: every key byte >= 0x80
    // becomes U+FFFD, so e.g. allowance ids 128-255 (u32 keys 00 00 00 80…ff) all land on one entry. Compare bytes
    // instead, as the chain does (audit-fixes-1: needed to test 256 open allowances). Survives MockVM.reset (initDb).
    mockVM.db.comparator = (a, b) => {
      const n = Math.min(a.length, b.length);
      for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
      return a.length - b.length;
    };
    mockVM.db.commitTransaction = function () { this.backupDb = new somap.SoMap(this.db, this.comparator); }; // rollback copy too
    mockVM.db.initDb();
    const vmImports = mockVM.getImports();
    // Cost probe (audit-fixes-1, AB-002): a spec may declare env.ms_cost_begin / env.ms_cost_end to count the system
    // calls (and the bytes they move) made between the two marks. MockVM has no compute metering, so this is the closest
    // local measure of what an authorize call costs. Unused by every other spec.
    const cost = { on: false, calls: 0, argBytes: 0, retBytes: 0, byId: {}, t0: 0n };
    let mem = null;
    const invoke = vmImports.invoke_system_call;
    vmImports.invoke_system_call = (sid, retPtr, retLen, argPtr, argLen, retBytesPtr) => {
      const r = invoke(sid, retPtr, retLen, argPtr, argLen, retBytesPtr);
      if (cost.on) {
        cost.calls++; cost.argBytes += argLen; cost.byId[sid] = (cost.byId[sid] || 0) + 1;
        if (mem) cost.retBytes += new Uint32Array(mem.buffer, retBytesPtr, 1)[0];
      }
      return r;
    };
    const myImports = {
      wasi_snapshot_preview1: { fd_write: () => {}, proc_exit: () => {} },
      env: {
        ...vmImports,
        ms_cost_begin: () => { Object.assign(cost, { on: true, calls: 0, argBytes: 0, retBytes: 0, byId: {}, t0: process.hrtime.bigint() }); },
        ms_cost_end: (tag) => {
          cost.on = false;
          const us = Number(process.hrtime.bigint() - cost.t0) / 1000;
          const top = Object.entries(cost.byId).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${SID[k] || k}=${v}`).join(" ");
          console.log(`[cost] probe ${tag}: ${cost.calls} system calls (${top}); ${cost.argBytes} bytes in, ${cost.retBytes} bytes out; ${us.toFixed(0)} us in MockVM`);
        },
      },
    };
    const instance = instantiate(binary, createImports(myImports));
    instance.then((result) => {
      // Reserve plenty of memory up front: the test runtime never frees, and the simulated chain keeps views of the
      // memory that a later grow would invalidate. 512 MiB (was 128): the 256-open-allowance probe (audit-fixes-1) runs
      // out of 128 MiB and its system calls then read stale memory ("token not accepted" at the 128th purchase).
      result.exports.memory.grow(8192);
      mem = result.exports.memory;
      mockVM.setInstance(result);
    });
    return instance;
  },
  coverage: [],
  outputBinary: false,
};
