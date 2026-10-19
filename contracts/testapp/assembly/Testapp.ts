import { System, Storage, authority } from "@koinos/sdk-as";
import { testapp } from "./proto/testapp";

export class Testapp {
  counters: Storage.Map<Uint8Array, testapp.counter_object> = new Storage.Map(System.getContractId(), 0, testapp.counter_object.decode, testapp.counter_object.encode, () => new testapp.counter_object());

  play(args: testapp.play_arguments): testapp.play_result {
    System.require(System.checkAuthority(authority.authorization_type.contract_call, args.user!), "not signed by user");
    const c = this.counters.get(args.user!)!; c.n += 1; this.counters.put(args.user!, c);
    return new testapp.play_result(c.n);
  }
  heavy(args: testapp.heavy_arguments): testapp.heavy_result {
    System.require(System.checkAuthority(authority.authorization_type.contract_call, args.user!), "not signed by user");
    for (let i: u32 = 0; i < args.items && i < 20; i++) {
      const k = new Uint8Array(args.user!.length + 1); k.set(args.user!, 0); k[args.user!.length] = u8(i + 1);
      const c = this.counters.get(k)!; c.n += 1; this.counters.put(k, c);
    }
    return new testapp.heavy_result();
  }
  nope(args: testapp.nope_arguments): testapp.nope_result { return new testapp.nope_result(); }
  boom(args: testapp.boom_arguments): testapp.boom_result { System.revert("boom"); return new testapp.boom_result(); }
  get(args: testapp.get_arguments): testapp.get_result { return new testapp.get_result(this.counters.get(args.user!)!.n); }
}
