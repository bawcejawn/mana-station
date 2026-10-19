import { Writer, Reader } from "as-proto";

export namespace testapp {
  @unmanaged
  export class counter_object {
    static encode(message: counter_object, writer: Writer): void {
      if (message.n != 0) {
        writer.uint32(8);
        writer.uint64(message.n);
      }
    }

    static decode(reader: Reader, length: i32): counter_object {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new counter_object();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.n = reader.uint64();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    n: u64;

    constructor(n: u64 = 0) {
      this.n = n;
    }
  }

  export class play_arguments {
    static encode(message: play_arguments, writer: Writer): void {
      const unique_name_user = message.user;
      if (unique_name_user !== null) {
        writer.uint32(10);
        writer.bytes(unique_name_user);
      }
    }

    static decode(reader: Reader, length: i32): play_arguments {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new play_arguments();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.user = reader.bytes();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    user: Uint8Array | null;

    constructor(user: Uint8Array | null = null) {
      this.user = user;
    }
  }

  @unmanaged
  export class play_result {
    static encode(message: play_result, writer: Writer): void {
      if (message.n != 0) {
        writer.uint32(8);
        writer.uint64(message.n);
      }
    }

    static decode(reader: Reader, length: i32): play_result {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new play_result();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.n = reader.uint64();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    n: u64;

    constructor(n: u64 = 0) {
      this.n = n;
    }
  }

  export class heavy_arguments {
    static encode(message: heavy_arguments, writer: Writer): void {
      const unique_name_user = message.user;
      if (unique_name_user !== null) {
        writer.uint32(10);
        writer.bytes(unique_name_user);
      }

      if (message.items != 0) {
        writer.uint32(16);
        writer.uint32(message.items);
      }
    }

    static decode(reader: Reader, length: i32): heavy_arguments {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new heavy_arguments();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.user = reader.bytes();
            break;

          case 2:
            message.items = reader.uint32();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    user: Uint8Array | null;
    items: u32;

    constructor(user: Uint8Array | null = null, items: u32 = 0) {
      this.user = user;
      this.items = items;
    }
  }

  @unmanaged
  export class heavy_result {
    static encode(message: heavy_result, writer: Writer): void {}

    static decode(reader: Reader, length: i32): heavy_result {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new heavy_result();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    constructor() {}
  }

  @unmanaged
  export class nope_arguments {
    static encode(message: nope_arguments, writer: Writer): void {}

    static decode(reader: Reader, length: i32): nope_arguments {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new nope_arguments();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    constructor() {}
  }

  @unmanaged
  export class nope_result {
    static encode(message: nope_result, writer: Writer): void {}

    static decode(reader: Reader, length: i32): nope_result {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new nope_result();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    constructor() {}
  }

  @unmanaged
  export class boom_arguments {
    static encode(message: boom_arguments, writer: Writer): void {}

    static decode(reader: Reader, length: i32): boom_arguments {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new boom_arguments();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    constructor() {}
  }

  @unmanaged
  export class boom_result {
    static encode(message: boom_result, writer: Writer): void {}

    static decode(reader: Reader, length: i32): boom_result {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new boom_result();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    constructor() {}
  }

  export class get_arguments {
    static encode(message: get_arguments, writer: Writer): void {
      const unique_name_user = message.user;
      if (unique_name_user !== null) {
        writer.uint32(10);
        writer.bytes(unique_name_user);
      }
    }

    static decode(reader: Reader, length: i32): get_arguments {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new get_arguments();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.user = reader.bytes();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    user: Uint8Array | null;

    constructor(user: Uint8Array | null = null) {
      this.user = user;
    }
  }

  @unmanaged
  export class get_result {
    static encode(message: get_result, writer: Writer): void {
      if (message.n != 0) {
        writer.uint32(8);
        writer.uint64(message.n);
      }
    }

    static decode(reader: Reader, length: i32): get_result {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new get_result();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.n = reader.uint64();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    n: u64;

    constructor(n: u64 = 0) {
      this.n = n;
    }
  }
}
