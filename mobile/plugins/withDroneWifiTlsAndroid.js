const fs = require("fs");
const path = require("path");
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
} = require("@expo/config-plugins");

/**
 * Trust the wifi_gps_softap self-signed server certificate (CN=drone-ap, SAN 192.168.4.1)
 * for HTTPS/WSS to the drone SoftAP gateway. Scoped to 192.168.4.1 only.
 */
function withDroneWifiTlsAndroid(config) {
  config = withAndroidManifest(config, (modConfig) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(modConfig.modResults);
    app.$["android:networkSecurityConfig"] = "@xml/network_security_config";
    return modConfig;
  });

  config = withDangerousMod(config, [
    "android",
    async (modConfig) => {
      const { platformProjectRoot, projectRoot } = modConfig.modRequest;
      const xmlDir = path.join(platformProjectRoot, "app/src/main/res/xml");
      const rawDir = path.join(platformProjectRoot, "app/src/main/res/raw");
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.mkdirSync(rawDir, { recursive: true });

      const certSrc = path.join(projectRoot, "certs/drone_ap_server_cert.pem");
      const certDst = path.join(rawDir, "drone_ap_server_cert.pem");
      if (!fs.existsSync(certSrc)) {
        throw new Error(`Missing TLS cert for Android trust: ${certSrc}`);
      }
      fs.copyFileSync(certSrc, certDst);

      const xmlPath = path.join(xmlDir, "network_security_config.xml");
      fs.writeFileSync(
        xmlPath,
        `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <domain-config cleartextTrafficPermitted="false">
    <domain includeSubdomains="false">192.168.4.1</domain>
    <trust-anchors>
      <certificates src="@raw/drone_ap_server_cert"/>
      <certificates src="system"/>
    </trust-anchors>
  </domain-config>
</network-security-config>
`
      );

      return modConfig;
    },
  ]);

  return config;
}

module.exports = withDroneWifiTlsAndroid;
