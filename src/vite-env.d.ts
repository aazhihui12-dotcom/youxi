declare module '*.css';

declare module '*.css?inline' {
  const stylesheet: string;
  export default stylesheet;
}

declare module '*.html?raw' {
  const html: string;
  export default html;
}
