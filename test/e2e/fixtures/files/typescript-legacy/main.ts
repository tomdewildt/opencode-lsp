export function greet(name: string): string {
  return `Hello ${name}`;
}

export const count: number = greet("world");
