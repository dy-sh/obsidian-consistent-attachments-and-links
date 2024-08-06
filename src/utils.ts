export class Utils {
  public static normalizePathForFile(path: string): string {
    path = path.replace(/\\/gi, "/"); //replace \ to /
    path = path.replace(/%20/gi, " "); //replace %20 to space
    return path;
  }

  public static normalizePathForLink(path: string): string {
    path = path.replace(/\\/gi, "/"); //replace \ to /
    path = path.replace(/ /gi, "%20"); //replace space to %20
    return path;
  }
}
