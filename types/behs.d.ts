/** Type declarations for behavior modules loaded via dynamic import. */
declare module './behs/*.js' {
  const behavior: any;
  export default behavior;
  export { behavior };
}
