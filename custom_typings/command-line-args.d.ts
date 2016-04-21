declare module "command-line-args" {
  interface ArgDescriptor {
    name: string;
    // type: Object;
    alias?: string;
    description: string;
    defaultValue?: any;
    defaultOption?: boolean;
    type: (val: string) => any;
    multiple?: boolean;
  }
  interface UsageOpts {
    title: string;
    header?: string;
    description?: string;
  }
  interface CLI {
    parse(): any;
    getUsage(opts: UsageOpts): string;
  }

  function commandLineArgs(args: ArgDescriptor[]): CLI;
  namespace commandLineArgs {}

  export = commandLineArgs;
}
