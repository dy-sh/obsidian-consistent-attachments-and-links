export class Utils {
    static async delay(ms: number) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

    static normalizePathForFile(path: string) :string{
		path = path.replace(/\\/gi, "/"); //replace \ to /
		path = path.replace(/%20/gi, " "); //replace %20 to space
		return path;
	}

	static normalizePathForLink(path: string):string {
		path = path.replace(/\\/gi, "/"); //replace \ to /
		path = path.replace(/ /gi, "%20"); //replace space to %20
		return path;
	}
}