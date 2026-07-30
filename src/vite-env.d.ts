declare module '*.css';

declare module '*.css?inline' {
  const stylesheet: string;
  export default stylesheet;
}
