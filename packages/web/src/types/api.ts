export class Resp<T> {
  code: number;
  message?: string;
  data?: T;
  additional?: string;

  constructor(code: number, message?: string, data?: T, additional?: string) {
    this.code = code;
    this.message = message;
    this.data = data;
    this.additional = additional;
  }

  static create<J>(code: number, message: string, data: J): Resp<J> {
    return new Resp(code, message, data, undefined);
  }

  static ok<J>(data: J, additional?: string): Resp<J> {
    return new Resp(0, undefined, data, additional);
  }

  static err(message: string): Resp<undefined> {
    return new Resp(1, message, undefined, undefined);
  }

  static errWithData<J>(message: string, data: J): Resp<J> {
    return new Resp(1, message, data, undefined);
  }
}

export interface AuthPayload {
  address: string;
}

export interface DUser {
  id: string;
  address: string;
  dao_code: string;
  name?: string;
  power?: string;
  email?: string;
  twitter?: string;
  github?: string;
  discord?: string;
  telegram?: string;
  medium?: string;
  delegate_statement?: string;
  additional?: string;
  last_login_time: string;
  ctime?: string;
  utime?: string;
}

export interface DAvatar {
  id: string;
  image: string;
  ctime: string;
  utime?: string;
}

export interface DaoDetectlResult {
  daocode: string;
  daosite: string;
}