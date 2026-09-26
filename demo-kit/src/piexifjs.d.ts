declare module "piexifjs" {
  const piexif: {
    ImageIFD: Record<string, number>;
    ExifIFD: Record<string, number>;
    GPSIFD: Record<string, number>;
    dump(data: unknown): string;
    insert(exif: string, jpeg: string): string;
    load(jpeg: string): unknown;
  };
  export default piexif;
}
