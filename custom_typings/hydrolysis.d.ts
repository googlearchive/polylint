declare module "hydrolysis" {
  interface Options {
    filter?: (path: string) => boolean;
  }
  interface Element {
    is: string;
    contentHref: string;
    desc?: string;
  }
  interface Behavior {
    is: string;
    contentHref: string;
    desc?: string;
  }
  export class Analyzer {
    static analyze(path: string, options: Options): Promise<Analyzer>;
    metadataTree(path: string): Promise<void>;
    annotate(): void;
    elements: Element[];
    behaviors: Behavior[];
  }
}
