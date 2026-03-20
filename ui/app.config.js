const packageJson = require('./package.json');

// "1.2.3" → 10203, "1.0.0" → 10000, "2.1.4" → 20104
const [major, minor, patch] = packageJson.version.split('.').map(Number);
const versionCode = major * 10000 + minor * 100 + patch;

module.exports = {
  expo: {
    name: 'Hostel Manager',
    slug: 'hostel-manager',
    version: packageJson.version,
    jsEngine: 'hermes',
    orientation: 'portrait',
    icon: './assets/images/icon-1024.png',
    splash: {
      image: './assets/images/hm-logo-v2.jpg',
      resizeMode: 'contain',
      backgroundColor: '#FFFFFF',
    },
    scheme: 'hostelmanager',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    platforms: ['android', 'ios'],
    plugins: ['expo-router', 'expo-secure-store', 'expo-font'],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      router: {},
      eas: {
        projectId: 'f2c359b8-1d34-4e1d-9aaf-be71065ae390',
      },
    },
    android: {
      package: 'com.shoverhub.hostelmanager',
      versionCode,                // ← derived from package.json, never hardcoded
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-foreground-1024.png',
        backgroundColor: '#FFFFFF',
      },
      blockedPermissions: ['android.permission.READ_PHONE_STATE'],
    },
  },
};