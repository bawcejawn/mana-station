// AB-031 (audit-fixes-1): as-pect's expect(fn).toThrow("text") passes on ANY revert; the text is only the failure
// message. A refusal test proves its reason by also checking the contract's own revert message:
//   clearRevert(); expect(() => { … }).toThrow("why"); revertedWith("the contract's message", "why");
// clearRevert empties MockVM's stored message first, so a message left by an earlier revert can't pass the check (and a
// trap that isn't a System.require leaves it empty).
import { MockVM, System } from "@koinos/sdk-as";

export function clearRevert(): void { System.putBytes(MockVM.METADATA_SPACE, "error_message", new Uint8Array(0)); }
export function lastRevert(): string { const m = MockVM.getErrorMessage(); return m != null ? m! : ""; }
export function revertedWith(msg: string, why: string = ""): void { expect(lastRevert()).toBe(msg, why.length > 0 ? why : "reverted for another reason"); }
