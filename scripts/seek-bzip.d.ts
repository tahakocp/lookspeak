declare module "seek-bzip" {
  const Bunzip: { decode(input: Uint8Array): Buffer };
  export default Bunzip;
}
