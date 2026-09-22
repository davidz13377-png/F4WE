const { withDangerousMod } = require("expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

module.exports = function withF4WEAndroid(config) {
  return withDangerousMod(config, ["android", async mod => {
    const source = path.join(mod.modRequest.projectRoot, "assets", "android", "drawable", "f4we_notification.png");
    const destination = path.join(mod.modRequest.platformProjectRoot, "app", "src", "main", "res", "drawable", "f4we_notification.png");
    if (!fs.existsSync(source)) throw new Error(`Missing F4WE notification icon: ${source}`);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
    return mod;
  }]);
};
