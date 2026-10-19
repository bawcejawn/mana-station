import { System, Protobuf, authority } from "@koinos/sdk-as";
import { Testapp as ContractClass } from "./Testapp";
import { testapp as ProtoNamespace } from "./proto/testapp";

export function main(): i32 {
  const contractArgs = System.getArguments();
  let retbuf = new Uint8Array(1024);

  const c = new ContractClass();

  switch (contractArgs.entry_point) {
    case 0xaba4cc9b: {
      const args = Protobuf.decode<ProtoNamespace.play_arguments>(
        contractArgs.args,
        ProtoNamespace.play_arguments.decode
      );
      const res = c.play(args);
      retbuf = Protobuf.encode(res, ProtoNamespace.play_result.encode);
      break;
    }

    case 0x22d5925e: {
      const args = Protobuf.decode<ProtoNamespace.heavy_arguments>(
        contractArgs.args,
        ProtoNamespace.heavy_arguments.decode
      );
      const res = c.heavy(args);
      retbuf = Protobuf.encode(res, ProtoNamespace.heavy_result.encode);
      break;
    }

    case 0xca3704aa: {
      const args = Protobuf.decode<ProtoNamespace.nope_arguments>(
        contractArgs.args,
        ProtoNamespace.nope_arguments.decode
      );
      const res = c.nope(args);
      retbuf = Protobuf.encode(res, ProtoNamespace.nope_result.encode);
      break;
    }

    case 0x81f52337: {
      const args = Protobuf.decode<ProtoNamespace.boom_arguments>(
        contractArgs.args,
        ProtoNamespace.boom_arguments.decode
      );
      const res = c.boom(args);
      retbuf = Protobuf.encode(res, ProtoNamespace.boom_result.encode);
      break;
    }

    case 0x2998b323: {
      const args = Protobuf.decode<ProtoNamespace.get_arguments>(
        contractArgs.args,
        ProtoNamespace.get_arguments.decode
      );
      const res = c.get(args);
      retbuf = Protobuf.encode(res, ProtoNamespace.get_result.encode);
      break;
    }

    default:
      System.exit(1);
      break;
  }

  System.exit(0, retbuf);
  return 0;
}

main();
