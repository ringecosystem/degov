export class Resp<T> {
  code: number;
  message?: string;
  data?: T;
  additional?: any;

  constructor(code: number, message?: string, data?: T, additional?: any) {
    this.code = code;
    this.message = message;
    this.data = data;
    this.additional = additional;
  }

  static create<J>(code: number, message: string, data: J): Resp<J> {
    return new Resp(code, message, data, undefined);
  }

  static ok<J>(data: J, additional?: any): Resp<J> {
    return new Resp(0, undefined, data, additional);
  }

  static err(message: string): Resp<undefined> {
    return new Resp(1, message, undefined, undefined);
  }

  static errWithData<J>(message: string, data: J): Resp<J> {
    return new Resp(1, message, data, undefined);
  }
}
